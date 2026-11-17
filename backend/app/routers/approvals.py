"""FastAPI router for Admin/Pimpinan Approval Queue, SLA Sorting, and Approve/Reject actions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import AuthenticatedUser, require_roles
from app.database import get_db
from app.schemas import (
    ApprovalActionResponse,
    ApprovalDecisionRequest,
    ConflictErrorResponse,
    PendingApprovalsResponse,
)
from app.services.approval_service import list_pending_approvals, process_approval_decision
from app.services.conflict_service import ScheduleConflictError

router = APIRouter(tags=["E-Approval & SLA Tracking"])


@router.get(
    "/approvals/pending",
    response_model=PendingApprovalsResponse,
    summary="Daftar Antrean Approval Terurut SLA Terdekat (Dashboard Admin/Pimpinan)",
)
def get_pending_approvals(
    include_all_stages: bool = Query(
        default=False,
        description="Jika true, tampilkan seluruh antrean Verifikator & Pimpinan.",
    ),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("VERIFIKATOR", "PIMPINAN", "SUPER_ADMIN")),
) -> PendingApprovalsResponse:
    """
    Fetch pending training requests for Admin/Verifikator and Pimpinan dashboards,
    sorted by closest `sla_deadline` ascending with real-time SLA health indicators.
    """
    return list_pending_approvals(
        db,
        actor=current_user,
        include_all_stages=include_all_stages,
    )


@router.put(
    "/permohonan/{permohonan_id}/approve",
    response_model=ApprovalActionResponse,
    responses={
        409: {
            "model": ConflictErrorResponse,
            "description": "Konflik jadwal saat mengunci slot kalender atau transisi status tidak valid.",
        }
    },
    summary="Verifikasi, Setujui (TTE + Kunci Kalender), atau Tolak Permohonan",
)
def approve_or_reject_permohonan(
    permohonan_id: UUID,
    payload: ApprovalDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("VERIFIKATOR", "PIMPINAN", "SUPER_ADMIN")),
) -> ApprovalActionResponse:
    """
    Process a multi-level approval action inside a single atomic DB transaction:
    - `VERIFY_FORWARD`: Verifikator forwards to Pimpinan.
    - `REQUEST_REVISION`: Verifikator returns ticket to Pemohon with revision note.
    - `APPROVE`: Pimpinan signs (TTE) and inserts/confirms `jadwal_reservasi` (`CONFIRMED`) to lock the calendar.
    - `REJECT`: Rejects request and releases any reserved slot (`RELEASED`).
    """
    client_ip = request.client.host if request.client else None
    try:
        updated, message = process_approval_decision(
            db,
            permohonan_id=permohonan_id,
            payload=payload,
            actor=current_user,
            client_ip=client_ip,
        )
    except ScheduleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": exc.message,
                "conflicts": [c.model_dump(mode="json") for c in exc.conflicts],
            },
        ) from exc

    return ApprovalActionResponse(
        id=updated.id,
        nomor_tiket=updated.nomor_tiket,
        status_approval=updated.status_approval,
        current_approval_level=updated.current_approval_level,
        resolved_at=updated.resolved_at,
        tte_document_hash=updated.tte_document_hash,
        tte_signed_at=updated.tte_signed_at,
        reservasi=updated.reservasi,
        message=message,
    )
