"""Service layer for Auto-Conflict Detection, Atomic Booking, and SLA Initialization."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import secrets
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import AuthenticatedUser
from app.models import (
    ApprovalActionEnum,
    ApprovalLog,
    ApprovalStatusEnum,
    FasilitasRuangan,
    JadwalReservasi,
    Pemateri,
    Permohonan,
    ReservationSlotStatusEnum,
)
from app.schemas import ConflictDetail, PermohonanCreate


ACTIVE_SLOT_STATUSES = (
    ReservationSlotStatusEnum.LOCKED_PENDING,
    ReservationSlotStatusEnum.CONFIRMED,
)

ACTIVE_APPROVAL_STATUSES = (
    ApprovalStatusEnum.MENUNGGU_VERIFIKASI,
    ApprovalStatusEnum.MENUNGGU_APPROVAL_PIMPINAN,
    ApprovalStatusEnum.DISETUJUI_TTE,
)


class ScheduleConflictError(Exception):
    """Raised when room/instructor overlap or capacity/load rules are violated."""

    def __init__(self, message: str, conflicts: list[ConflictDetail]) -> None:
        super().__init__(message)
        self.message = message
        self.conflicts = conflicts


def detect_booking_conflicts(
    db: Session,
    *,
    ruangan_id: UUID,
    pemateri_id: UUID,
    waktu_mulai: datetime,
    waktu_selesai: datetime,
    jumlah_peserta: int,
) -> list[ConflictDetail]:
    """
    Query `jadwal_reservasi` and master tables to detect time overlaps and resource limits.

    Overlap formula (half-open interval [start, end)):
        existing.waktu_mulai < requested.waktu_selesai
        AND existing.waktu_selesai > requested.waktu_mulai
    Allows back-to-back sessions (e.g., 09:00-12:00 and 12:00-15:00) without false conflicts.
    """
    conflicts: list[ConflictDetail] = []

    # 1. Validate Room availability & capacity
    room = db.execute(
        select(FasilitasRuangan).where(
            FasilitasRuangan.id == ruangan_id,
            FasilitasRuangan.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fasilitas ruangan tidak ditemukan atau sedang non-aktif.",
        )

    if jumlah_peserta > room.kapasitas:
        conflicts.append(
            ConflictDetail(
                conflict_type="CAPACITY_EXCEEDED",
                message=(
                    f"Jumlah peserta ({jumlah_peserta} orang) melebihi kapasitas maksimal "
                    f"{room.nama_ruangan} ({room.kapasitas} orang)."
                ),
            )
        )

    # 2. Validate Instructor availability & weekly teaching hour ceiling
    instructor = db.execute(
        select(Pemateri).where(
            Pemateri.id == pemateri_id,
            Pemateri.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if instructor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pemateri/instruktur tidak ditemukan atau berstatus non-aktif.",
        )

    # 3. Query `jadwal_reservasi` for overlapping active/approved slots on Room OR Instructor
    overlap_stmt = (
        select(JadwalReservasi)
        .join(JadwalReservasi.permohonan)
        .options(joinedload(JadwalReservasi.permohonan))
        .where(
            JadwalReservasi.status_slot.in_(ACTIVE_SLOT_STATUSES),
            Permohonan.status_approval.in_(ACTIVE_APPROVAL_STATUSES),
            or_(
                JadwalReservasi.ruangan_id == ruangan_id,
                JadwalReservasi.pemateri_id == pemateri_id,
            ),
            and_(
                JadwalReservasi.waktu_mulai < waktu_selesai,
                JadwalReservasi.waktu_selesai > waktu_mulai,
            ),
        )
        .with_for_update(of=JadwalReservasi)
    )
    overlapping_slots = db.execute(overlap_stmt).scalars().all()

    for slot in overlapping_slots:
        ticket = slot.permohonan.nomor_tiket if slot.permohonan else None
        if slot.ruangan_id == ruangan_id:
            conflicts.append(
                ConflictDetail(
                    conflict_type="ROOM_TIME_OVERLAP",
                    message=(
                        f"Bentrok jadwal ruangan pada {room.nama_ruangan}: waktu yang diminta "
                        f"tumpang tindih dengan tiket {ticket or slot.permohonan_id}."
                    ),
                    conflicting_ticket=ticket,
                    conflicting_start=slot.waktu_mulai,
                    conflicting_end=slot.waktu_selesai,
                )
            )
        if slot.pemateri_id == pemateri_id:
            conflicts.append(
                ConflictDetail(
                    conflict_type="INSTRUCTOR_TIME_OVERLAP",
                    message=(
                        f"Bentrok jadwal pemateri ({instructor.nama_pemateri}): instruktur sudah "
                        f"terjadwal pada tiket {ticket or slot.permohonan_id}."
                    ),
                    conflicting_ticket=ticket,
                    conflicting_start=slot.waktu_mulai,
                    conflicting_end=slot.waktu_selesai,
                )
            )

    # 4. Enforce weekly maximum teaching hours for the instructor
    week_start = (waktu_mulai - timedelta(days=waktu_mulai.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=7)

    weekly_slots = db.execute(
        select(JadwalReservasi).where(
            JadwalReservasi.pemateri_id == pemateri_id,
            JadwalReservasi.status_slot.in_(ACTIVE_SLOT_STATUSES),
            JadwalReservasi.waktu_mulai >= week_start,
            JadwalReservasi.waktu_mulai < week_end,
        )
    ).scalars().all()

    existing_hours = sum(
        Decimal((s.waktu_selesai - s.waktu_mulai).total_seconds()) / Decimal("3600")
        for s in weekly_slots
    )
    requested_hours = Decimal((waktu_selesai - waktu_mulai).total_seconds()) / Decimal("3600")
    if existing_hours + requested_hours > instructor.max_jam_mengajar_mingguan:
        conflicts.append(
            ConflictDetail(
                conflict_type="INSTRUCTOR_LOAD_EXCEEDED",
                message=(
                    f"Beban mengajar mingguan {instructor.nama_pemateri} "
                    f"({existing_hours + requested_hours:.1f} jam) melebihi batas maksimal "
                    f"({instructor.max_jam_mengajar_mingguan} jam/minggu)."
                ),
            )
        )

    return conflicts


def _generate_ticket_number(now: datetime) -> str:
    suffix = secrets.token_hex(3).upper()
    return f"SP-{now.year}-{suffix}"


def create_permohonan_with_sla(
    db: Session,
    *,
    payload: PermohonanCreate,
    actor: AuthenticatedUser,
    client_ip: str | None = None,
) -> Permohonan:
    """
    Atomically validate conflicts, persist Permohonan + JadwalReservasi,
    start the multi-stage SLA tracker (24h Verifikator + 48h Final), and write ApprovalLog.
    """
    now = datetime.now(timezone.utc)

    # Stage 1: Application-level conflict & capacity detection
    conflicts = detect_booking_conflicts(
        db,
        ruangan_id=payload.ruangan_id,
        pemateri_id=payload.pemateri_id,
        waktu_mulai=payload.waktu_mulai,
        waktu_selesai=payload.waktu_selesai,
        jumlah_peserta=payload.jumlah_peserta,
    )
    if conflicts:
        raise ScheduleConflictError(
            message="Pengajuan ditolak karena terdeteksi bentrok jadwal atau pelanggaran kapasitas.",
            conflicts=conflicts,
        )

    # Stage 2: Initialize SLA Tracker (Stage 1 Verifikasi: 24 jam, Final Approval: 48 jam)
    sla_verifikasi_deadline = now + timedelta(hours=24)
    sla_final_deadline = now + timedelta(hours=48)

    new_permohonan = Permohonan(
        nomor_tiket=_generate_ticket_number(now),
        user_id=actor.id,
        unit_kerja_id=actor.unit_kerja_id,
        judul_pelatihan=payload.judul_pelatihan.strip(),
        jenis_kegiatan=payload.jenis_kegiatan,
        jumlah_peserta=payload.jumlah_peserta,
        catatan_pemohon=payload.catatan_pemohon,
        status_approval=ApprovalStatusEnum.MENUNGGU_VERIFIKASI,
        current_approval_level=1,
        waktu_pengajuan=now,
        sla_verifikasi_deadline=sla_verifikasi_deadline,
        sla_deadline=sla_final_deadline,
        is_escalated=False,
    )
    db.add(new_permohonan)
    db.flush()  # Populate new_permohonan.id before inserting child records

    # Lock room & instructor slot immediately during verification/approval (LOCKED_PENDING)
    new_reservation = JadwalReservasi(
        permohonan_id=new_permohonan.id,
        ruangan_id=payload.ruangan_id,
        pemateri_id=payload.pemateri_id,
        waktu_mulai=payload.waktu_mulai,
        waktu_selesai=payload.waktu_selesai,
        status_slot=ReservationSlotStatusEnum.LOCKED_PENDING,
    )
    db.add(new_reservation)

    # Record permanent immutable audit log entry
    audit_log = ApprovalLog(
        permohonan_id=new_permohonan.id,
        user_id=actor.id,
        action=ApprovalActionEnum.SUBMIT,
        previous_status=ApprovalStatusEnum.DRAFT,
        new_status=ApprovalStatusEnum.MENUNGGU_VERIFIKASI,
        note="Permohonan diajukan melalui portal 1 pintu. Slot dikunci dan argo SLA 2x24 jam dimulai.",
        ip_address=client_ip,
    )
    db.add(audit_log)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Catch PostgreSQL 23P01 (exclusion_violation) if 2 parallel requests race past SELECT
        pgcode = getattr(exc.orig, "pgcode", None)
        if pgcode == "23P01":
            raise ScheduleConflictError(
                message="Bentrok konkurensi terdeteksi oleh PostgreSQL GiST Exclusion Constraint.",
                conflicts=[
                    ConflictDetail(
                        conflict_type="ROOM_TIME_OVERLAP",
                        message="Slot waktu baru saja dikunci oleh permohonan lain secara bersamaan.",
                    )
                ],
            ) from exc
        raise

    db.refresh(new_permohonan)
    return new_permohonan
