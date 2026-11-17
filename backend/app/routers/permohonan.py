"""FastAPI router for Permohonan Pelatihan (1 Pintu) submission and inspection."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth import AuthenticatedUser, get_current_user, require_roles
from app.database import get_db
from app.models import Permohonan
from app.schemas import ConflictErrorResponse, PermohonanCreate, PermohonanOut
from app.services.conflict_service import (
    ScheduleConflictError,
    create_permohonan_with_sla,
    detect_booking_conflicts,
)

router = APIRouter(prefix="/permohonan", tags=["Permohonan Pelatihan"])


@router.post(
    "",
    response_model=PermohonanOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {
            "model": ConflictErrorResponse,
            "description": "Jadwal ruangan/pemateri bentrok atau kapasitas ruangan terlampaui.",
        }
    },
    summary="Ajukan Permohonan Pelatihan Baru (1 Pintu)",
)
def submit_permohonan(
    payload: PermohonanCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("PEMOHON", "VERIFIKATOR", "SUPER_ADMIN")),
) -> Permohonan:
    """
    Submit a new training booking request:
    1. Enforces JWT authentication and RBAC role check.
    2. Checks `jadwal_reservasi` for overlapping `waktu_mulai` & `waktu_selesai` on `ruangan_id` / `pemateri_id`.
    3. Returns HTTP 409 Conflict with detailed diagnostics if overlap or capacity limit occurs.
    4. Persists `permohonan`, locks slot in `jadwal_reservasi`, starts 48-hour SLA tracker, and logs audit trail.
    """
    client_ip = request.client.host if request.client else None
    try:
        permohonan = create_permohonan_with_sla(
            db,
            payload=payload,
            actor=current_user,
            client_ip=client_ip,
        )
        return permohonan
    except ScheduleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": exc.message,
                "conflicts": [c.model_dump(mode="json") for c in exc.conflicts],
            },
        ) from exc


@router.get(
    "/availability/check",
    summary="Pre-flight Pengecekan Bentrok Jadwal (Smart Calendar)",
)
def check_availability(
    ruangan_id: UUID = Query(...),
    pemateri_id: UUID = Query(...),
    waktu_mulai: datetime = Query(...),
    waktu_selesai: datetime = Query(...),
    jumlah_peserta: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    _current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Non-mutating pre-flight endpoint used by the Smart Calendar booking form."""
    if waktu_selesai <= waktu_mulai:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="waktu_selesai harus lebih besar dari waktu_mulai.",
        )

    conflicts = detect_booking_conflicts(
        db,
        ruangan_id=ruangan_id,
        pemateri_id=pemateri_id,
        waktu_mulai=waktu_mulai,
        waktu_selesai=waktu_selesai,
        jumlah_peserta=jumlah_peserta,
    )
    return {
        "available": len(conflicts) == 0,
        "conflicts": [c.model_dump(mode="json") for c in conflicts],
    }


@router.get(
    "/{permohonan_id}",
    response_model=PermohonanOut,
    summary="Detail Permohonan Pelatihan",
)
def get_permohonan_detail(
    permohonan_id: UUID,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Permohonan:
    stmt = (
        select(Permohonan)
        .options(joinedload(Permohonan.reservasi))
        .where(Permohonan.id == permohonan_id)
    )
    permohonan = db.execute(stmt).scalar_one_or_none()
    if permohonan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permohonan tidak ditemukan.")

    # Unit isolation for Pemohon role (NFR-03)
    if current_user.role_code == "PEMOHON" and permohonan.unit_kerja_id != current_user.unit_kerja_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akses lintas unit kerja ditolak.")

    return permohonan
