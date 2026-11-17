"""Pydantic v2 request and response schemas for Permohonan Pelatihan."""

from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ApprovalStatusEnum, ReservationSlotStatusEnum


class PermohonanCreate(BaseModel):
    """Schema untuk pengajuan Permohonan Pelatihan baru (1 Pintu)."""

    judul_pelatihan: str = Field(
        ...,
        min_length=5,
        max_length=220,
        description="Judul lengkap kegiatan pelatihan, bimtek, atau workshop.",
        examples=["Bimbingan Teknis Arsitektur SPBE & Keamanan Siber"],
    )
    jenis_kegiatan: Literal[
        "Diklat Teknis",
        "Workshop SPBE",
        "Bimbingan Teknis",
        "Rapat Koordinasi",
    ] = Field(..., description="Kategori kegiatan pelatihan instansi.")
    jumlah_peserta: int = Field(
        ...,
        gt=0,
        le=1000,
        description="Estimasi jumlah peserta yang hadir (divalidasi terhadap kapasitas ruangan).",
    )
    ruangan_id: UUID = Field(..., description="UUID fasilitas ruangan yang dipilih.")
    pemateri_id: UUID = Field(..., description="UUID pemateri/instruktur yang ditugaskan.")
    waktu_mulai: datetime = Field(
        ...,
        description="Timestamp mulai pelatihan (harus menyertakan timezone ISO-8601, mis. +07:00 atau Z).",
    )
    waktu_selesai: datetime = Field(
        ...,
        description="Timestamp selesai pelatihan (harus lebih besar dari waktu_mulai).",
    )
    catatan_pemohon: str | None = Field(
        default=None,
        max_length=2000,
        description="Kebutuhan teknis tambahan seperti proyektor, audio, atau konsumsi.",
    )

    @model_validator(mode="after")
    def validate_schedule_window(self) -> "PermohonanCreate":
        if self.waktu_mulai.tzinfo is None or self.waktu_selesai.tzinfo is None:
            raise ValueError("waktu_mulai dan waktu_selesai wajib menyertakan informasi timezone (UTC/WIB).")
        if self.waktu_selesai <= self.waktu_mulai:
            raise ValueError("waktu_selesai harus lebih besar dari waktu_mulai.")
        if (self.waktu_selesai - self.waktu_mulai) < timedelta(minutes=30):
            raise ValueError("Durasi minimal pemesanan fasilitas pelatihan adalah 30 menit.")
        return self


class JadwalReservasiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ruangan_id: UUID
    pemateri_id: UUID
    waktu_mulai: datetime
    waktu_selesai: datetime
    status_slot: ReservationSlotStatusEnum


class SlaTrackerOut(BaseModel):
    waktu_pengajuan: datetime
    sla_verifikasi_deadline: datetime
    sla_deadline: datetime
    sla_target_hours: int = 48
    is_escalated: bool


class PermohonanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nomor_tiket: str
    user_id: UUID
    unit_kerja_id: UUID
    judul_pelatihan: str
    jenis_kegiatan: str
    jumlah_peserta: int
    catatan_pemohon: str | None
    status_approval: ApprovalStatusEnum
    current_approval_level: int
    waktu_pengajuan: datetime
    sla_verifikasi_deadline: datetime
    sla_deadline: datetime
    is_escalated: bool
    reservasi: JadwalReservasiOut


class ConflictDetail(BaseModel):
    conflict_type: Literal[
        "ROOM_TIME_OVERLAP",
        "INSTRUCTOR_TIME_OVERLAP",
        "CAPACITY_EXCEEDED",
        "INSTRUCTOR_LOAD_EXCEEDED",
    ]
    message: str
    conflicting_ticket: str | None = None
    conflicting_start: datetime | None = None
    conflicting_end: datetime | None = None


class ConflictErrorResponse(BaseModel):
    detail: str
    conflicts: list[ConflictDetail]


class SlaHealthInfo(BaseModel):
    sla_health: Literal["AMAN", "WARNING", "TERLEWAT"]
    remaining_hours: float
    elapsed_percent: float
    is_escalated: bool


class PendingApprovalItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nomor_tiket: str
    judul_pelatihan: str
    jenis_kegiatan: str
    jumlah_peserta: int
    status_approval: ApprovalStatusEnum
    current_approval_level: int
    waktu_pengajuan: datetime
    sla_verifikasi_deadline: datetime
    sla_deadline: datetime
    sla_status: SlaHealthInfo
    reservasi: JadwalReservasiOut | None = None


class PendingApprovalsResponse(BaseModel):
    total: int
    overdue_count: int
    warning_count: int
    items: list[PendingApprovalItemOut]


class ScheduleLockPayload(BaseModel):
    """Opsional: parameter jadwal jika slot belum dibuat pada saat pengajuan awal."""

    ruangan_id: UUID
    pemateri_id: UUID
    waktu_mulai: datetime
    waktu_selesai: datetime

    @model_validator(mode="after")
    def validate_times(self) -> "ScheduleLockPayload":
        if self.waktu_mulai.tzinfo is None or self.waktu_selesai.tzinfo is None:
            raise ValueError("waktu_mulai dan waktu_selesai wajib menyertakan timezone.")
        if self.waktu_selesai <= self.waktu_mulai:
            raise ValueError("waktu_selesai harus lebih besar dari waktu_mulai.")
        return self


class ApprovalDecisionRequest(BaseModel):
    """Payload untuk PUT /permohonan/{id}/approve (Verifikasi, TTE Approve, atau Reject)."""

    decision: Literal["APPROVE", "REJECT", "VERIFY_FORWARD", "REQUEST_REVISION"]
    note: str | None = Field(default=None, max_length=2000)
    schedule_override: ScheduleLockPayload | None = None


class ApprovalActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nomor_tiket: str
    status_approval: ApprovalStatusEnum
    current_approval_level: int
    resolved_at: datetime | None = None
    tte_document_hash: str | None = None
    tte_signed_at: datetime | None = None
    reservasi: JadwalReservasiOut | None = None
    message: str
