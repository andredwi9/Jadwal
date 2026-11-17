"""Service layer for Multi-Level E-Approval, Calendar Locking, and SLA Tracking."""

from datetime import datetime, timezone
import hashlib
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import AuthenticatedUser
from app.models import (
    ApprovalActionEnum,
    ApprovalLog,
    ApprovalStatusEnum,
    JadwalReservasi,
    Permohonan,
    ReservationSlotStatusEnum,
    SlaEscalation,
)
from app.schemas import (
    ApprovalDecisionRequest,
    PendingApprovalItemOut,
    PendingApprovalsResponse,
    SlaHealthInfo,
)
from app.services.conflict_service import ScheduleConflictError, detect_booking_conflicts


PENDING_APPROVAL_STATUSES = (
    ApprovalStatusEnum.MENUNGGU_VERIFIKASI,
    ApprovalStatusEnum.MENUNGGU_APPROVAL_PIMPINAN,
)


def compute_sla_health(permohonan: Permohonan, now: datetime) -> SlaHealthInfo:
    """
    Compute real-time SLA status consistent with PostgreSQL view `v_permohonan_sla_monitor`:
    - TERLEWAT (Red): now > sla_deadline
    - WARNING (Amber): elapsed >= 75% of total SLA window
    - AMAN (Green): elapsed < 75%
    """
    total_seconds = max(1.0, (permohonan.sla_deadline - permohonan.waktu_pengajuan).total_seconds())
    elapsed_seconds = max(0.0, (now - permohonan.waktu_pengajuan).total_seconds())
    elapsed_percent = round(min(200.0, (elapsed_seconds / total_seconds) * 100.0), 1)
    remaining_hours = round((permohonan.sla_deadline - now).total_seconds() / 3600.0, 1)

    if now > permohonan.sla_deadline:
        health = "TERLEWAT"
    elif elapsed_percent >= 75.0:
        health = "WARNING"
    else:
        health = "AMAN"

    return SlaHealthInfo(
        sla_health=health,
        remaining_hours=remaining_hours,
        elapsed_percent=elapsed_percent,
        is_escalated=permohonan.is_escalated or health == "TERLEWAT",
    )


def list_pending_approvals(
    db: Session,
    *,
    actor: AuthenticatedUser,
    include_all_stages: bool = False,
) -> PendingApprovalsResponse:
    """
    Fetch pending approvals for Admin/Verifikator and Pimpinan dashboards,
    strictly ordered by closest SLA deadline ascending (most urgent / overdue first).
    """
    now = datetime.now(timezone.utc)

    if include_all_stages or actor.role_code == "SUPER_ADMIN":
        target_statuses = PENDING_APPROVAL_STATUSES
    elif actor.role_code == "VERIFIKATOR":
        target_statuses = (ApprovalStatusEnum.MENUNGGU_VERIFIKASI,)
    elif actor.role_code == "PIMPINAN":
        target_statuses = (ApprovalStatusEnum.MENUNGGU_APPROVAL_PIMPINAN,)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya Verifikator, Pimpinan, atau Super Admin yang dapat mengakses antrean approval.",
        )

    stmt = (
        select(Permohonan)
        .options(joinedload(Permohonan.reservasi))
        .where(Permohonan.status_approval.in_(target_statuses))
        # Closest SLA deadline (including already overdue timestamps) first
        .order_by(Permohonan.sla_deadline.asc(), Permohonan.waktu_pengajuan.asc())
    )
    rows = db.execute(stmt).scalars().unique().all()

    items: list[PendingApprovalItemOut] = []
    overdue_count = 0
    warning_count = 0

    for p in rows:
        sla_info = compute_sla_health(p, now)
        if sla_info.sla_health == "TERLEWAT":
            overdue_count += 1
        elif sla_info.sla_health == "WARNING":
            warning_count += 1

        items.append(
            PendingApprovalItemOut(
                id=p.id,
                nomor_tiket=p.nomor_tiket,
                judul_pelatihan=p.judul_pelatihan,
                jenis_kegiatan=p.jenis_kegiatan,
                jumlah_peserta=p.jumlah_peserta,
                status_approval=p.status_approval,
                current_approval_level=p.current_approval_level,
                waktu_pengajuan=p.waktu_pengajuan,
                sla_verifikasi_deadline=p.sla_verifikasi_deadline,
                sla_deadline=p.sla_deadline,
                sla_status=sla_info,
                reservasi=p.reservasi,
            )
        )

    return PendingApprovalsResponse(
        total=len(items),
        overdue_count=overdue_count,
        warning_count=warning_count,
        items=items,
    )


def _generate_tte_hash(permohonan: Permohonan, actor: AuthenticatedUser, signed_at: datetime) -> str:
    raw = f"{permohonan.id}:{permohonan.nomor_tiket}:{actor.nip}:{signed_at.isoformat()}".encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()[:24].upper()
    return f"TTE-SHA256-{digest}"


def process_approval_decision(
    db: Session,
    *,
    permohonan_id: UUID,
    payload: ApprovalDecisionRequest,
    actor: AuthenticatedUser,
    client_ip: str | None = None,
) -> tuple[Permohonan, str]:
    """
    Execute an atomic database transaction to Verify/Approve/Reject a Permohonan:
    - Locks the `permohonan` row with SELECT ... FOR UPDATE to prevent concurrent double-approval.
    - On APPROVE: validates schedule conflicts, inserts/confirms `jadwal_reservasi` (`CONFIRMED`)
      to lock the calendar, generates TTE signature hash, and closes open SLA escalations.
    - On REJECT: releases any `jadwal_reservasi` slot (`RELEASED`) and closes SLA tracking.
    - Always appends an immutable record to `approval_logs`.
    """
    now = datetime.now(timezone.utc)
    note = (payload.note or "").strip()

    # Lock target Permohonan row during the entire transaction
    permohonan = db.execute(
        select(Permohonan)
        .options(joinedload(Permohonan.reservasi))
        .where(Permohonan.id == permohonan_id)
        .with_for_update(of=Permohonan)
    ).scalar_one_or_none()

    if permohonan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permohonan pelatihan tidak ditemukan.",
        )

    prev_status = permohonan.status_approval
    if prev_status in (
        ApprovalStatusEnum.DISETUJUI_TTE,
        ApprovalStatusEnum.DITOLAK,
        ApprovalStatusEnum.DIBATALKAN,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Permohonan {permohonan.nomor_tiket} sudah berstatus final ({prev_status.value}).",
        )

    decision = payload.decision

    # 1. VERIFY_FORWARD (Level 1 Verifikator -> Level 2 Pimpinan)
    if decision == "VERIFY_FORWARD":
        if actor.role_code not in ("VERIFIKATOR", "SUPER_ADMIN"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hanya Verifikator atau Super Admin yang berwenang melakukan disposisi.",
            )
        if prev_status != ApprovalStatusEnum.MENUNGGU_VERIFIKASI:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Disposisi hanya berlaku untuk permohonan berstatus MENUNGGU_VERIFIKASI.",
            )

        permohonan.status_approval = ApprovalStatusEnum.MENUNGGU_APPROVAL_PIMPINAN
        permohonan.current_approval_level = 2
        audit_action = ApprovalActionEnum.VERIFY_FORWARD
        response_message = f"Tiket {permohonan.nomor_tiket} lolos verifikasi dan didisposisikan ke Pimpinan."

    # 2. REQUEST_REVISION (Level 1 Verifikator -> Pemohon)
    elif decision == "REQUEST_REVISION":
        if actor.role_code not in ("VERIFIKATOR", "SUPER_ADMIN"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hanya Verifikator yang dapat mengembalikan permohonan untuk revisi.",
            )
        if prev_status != ApprovalStatusEnum.MENUNGGU_VERIFIKASI:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Permintaan revisi hanya berlaku pada tahap MENUNGGU_VERIFIKASI.",
            )
        if not note:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Catatan revisi wajib diisi.",
            )

        permohonan.status_approval = ApprovalStatusEnum.PERLU_REVISI
        permohonan.current_approval_level = 1
        audit_action = ApprovalActionEnum.REQUEST_REVISION
        response_message = f"Tiket {permohonan.nomor_tiket} dikembalikan ke Pemohon untuk revisi."

    # 3. APPROVE (Final Approval & Calendar Locking in `jadwal_reservasi`)
    elif decision == "APPROVE":
        if actor.role_code not in ("PIMPINAN", "SUPER_ADMIN"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hanya Pimpinan (Eselon/Kadis) atau Super Admin yang berwenang melakukan Approval TTE.",
            )
        if prev_status != ApprovalStatusEnum.MENUNGGU_APPROVAL_PIMPINAN:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bypass ditolak: Permohonan harus melewati verifikasi admin sebelum Approval Pimpinan.",
            )

        # Determine schedule parameters (from schedule_override or existing pending reservation)
        existing_res = permohonan.reservasi
        if payload.schedule_override is not None:
            ruangan_id = payload.schedule_override.ruangan_id
            pemateri_id = payload.schedule_override.pemateri_id
            waktu_mulai = payload.schedule_override.waktu_mulai
            waktu_selesai = payload.schedule_override.waktu_selesai
        elif existing_res is not None:
            ruangan_id = existing_res.ruangan_id
            pemateri_id = existing_res.pemateri_id
            waktu_mulai = existing_res.waktu_mulai
            waktu_selesai = existing_res.waktu_selesai
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Data jadwal (ruangan_id, pemateri_id, waktu_mulai, waktu_selesai) wajib tersedia untuk mengunci kalender.",
            )

        # Re-verify conflicts if no active reservation existed yet or if schedule was overridden
        if existing_res is None or payload.schedule_override is not None:
            conflicts = detect_booking_conflicts(
                db,
                ruangan_id=ruangan_id,
                pemateri_id=pemateri_id,
                waktu_mulai=waktu_mulai,
                waktu_selesai=waktu_selesai,
                jumlah_peserta=permohonan.jumlah_peserta,
            )
            if conflicts:
                raise ScheduleConflictError(
                    message="Approval gagal: terdeteksi bentrok jadwal pada saat penguncian kalender.",
                    conflicts=conflicts,
                )

        # Automatically insert (or replace/lock) a CONFIRMED record into `jadwal_reservasi`
        if existing_res is None:
            locked_slot = JadwalReservasi(
                permohonan_id=permohonan.id,
                ruangan_id=ruangan_id,
                pemateri_id=pemateri_id,
                waktu_mulai=waktu_mulai,
                waktu_selesai=waktu_selesai,
                status_slot=ReservationSlotStatusEnum.CONFIRMED,
            )
            db.add(locked_slot)
        else:
            # Release old slot if schedule was overridden, then insert a fresh CONFIRMED lock
            if payload.schedule_override is not None:
                existing_res.status_slot = ReservationSlotStatusEnum.RELEASED
                db.flush()
                locked_slot = JadwalReservasi(
                    permohonan_id=permohonan.id,
                    ruangan_id=ruangan_id,
                    pemateri_id=pemateri_id,
                    waktu_mulai=waktu_mulai,
                    waktu_selesai=waktu_selesai,
                    status_slot=ReservationSlotStatusEnum.CONFIRMED,
                )
                db.add(locked_slot)
            else:
                existing_res.status_slot = ReservationSlotStatusEnum.CONFIRMED

        permohonan.status_approval = ApprovalStatusEnum.DISETUJUI_TTE
        permohonan.current_approval_level = 3
        permohonan.resolved_at = now
        permohonan.tte_signed_by = actor.id
        permohonan.tte_signed_at = now
        permohonan.tte_document_hash = _generate_tte_hash(permohonan, actor, now)

        audit_action = ApprovalActionEnum.APPROVE_TTE
        response_message = f"Tiket {permohonan.nomor_tiket} disetujui (TTE) dan jadwal terkunci di Smart Calendar."

    # 4. REJECT (Release any locked calendar slot & close SLA)
    elif decision == "REJECT":
        if actor.role_code not in ("VERIFIKATOR", "PIMPINAN", "SUPER_ADMIN"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Anda tidak memiliki otoritas untuk menolak permohonan.",
            )
        if not note:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Alasan penolakan (note) wajib diisi untuk jejak audit.",
            )

        permohonan.status_approval = ApprovalStatusEnum.DITOLAK
        permohonan.resolved_at = now
        if permohonan.reservasi is not None:
            permohonan.reservasi.status_slot = ReservationSlotStatusEnum.RELEASED

        audit_action = ApprovalActionEnum.REJECT
        response_message = f"Tiket {permohonan.nomor_tiket} ditolak dan slot kalender dilepas."

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Keputusan '{decision}' tidak dikenali.",
        )

    # Close any open SLA escalations when a terminal decision is reached
    if permohonan.status_approval in (ApprovalStatusEnum.DISETUJUI_TTE, ApprovalStatusEnum.DITOLAK):
        db.execute(
            update(SlaEscalation)
            .where(SlaEscalation.permohonan_id == permohonan.id, SlaEscalation.resolved_at.is_(None))
            .values(resolved_at=now)
        )

    # Record permanent audit entry
    db.add(
        ApprovalLog(
            permohonan_id=permohonan.id,
            user_id=actor.id,
            action=audit_action,
            previous_status=prev_status,
            new_status=permohonan.status_approval,
            note=note or response_message,
            ip_address=client_ip,
        )
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        pgcode = getattr(exc.orig, "pgcode", None)
        if pgcode == "23P01":
            raise ScheduleConflictError(
                message="Bentrok kalender terdeteksi oleh PostgreSQL GiST Exclusion Constraint saat penguncian jadwal.",
                conflicts=[],
            ) from exc
        raise

    db.refresh(permohonan)
    return permohonan, response_message
