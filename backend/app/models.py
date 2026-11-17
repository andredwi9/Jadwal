"""SQLAlchemy 2.0 ORM models mapped directly to the normalized PostgreSQL DDL."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TSTZRANGE, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ApprovalStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    MENUNGGU_VERIFIKASI = "MENUNGGU_VERIFIKASI"
    PERLU_REVISI = "PERLU_REVISI"
    MENUNGGU_APPROVAL_PIMPINAN = "MENUNGGU_APPROVAL_PIMPINAN"
    DISETUJUI_TTE = "DISETUJUI_TTE"
    DITOLAK = "DITOLAK"
    DIBATALKAN = "DIBATALKAN"


class ReservationSlotStatusEnum(str, enum.Enum):
    LOCKED_PENDING = "LOCKED_PENDING"
    CONFIRMED = "CONFIRMED"
    RELEASED = "RELEASED"


class ApprovalActionEnum(str, enum.Enum):
    SUBMIT = "SUBMIT"
    RESUBMIT = "RESUBMIT"
    VERIFY_FORWARD = "VERIFY_FORWARD"
    REQUEST_REVISION = "REQUEST_REVISION"
    APPROVE_TTE = "APPROVE_TTE"
    REJECT = "REJECT"
    CANCEL = "CANCEL"
    AUTO_ESCALATE = "AUTO_ESCALATE"


class SlaEscalationLevelEnum(str, enum.Enum):
    WARNING_75_PCT = "WARNING_75_PCT"
    BREACHED_100_PCT = "BREACHED_100_PCT"


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sla_priority: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UnitKerja(Base):
    __tablename__ = "unit_kerja"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kode_unit: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    nama_unit: Mapped[str] = mapped_column(String(150), nullable=False)
    eselon_level: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nip: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    nama: Mapped[str] = mapped_column(String(150), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False)
    unit_kerja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("unit_kerja.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    no_whatsapp: Mapped[str | None] = mapped_column(String(25))
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    role: Mapped["Role"] = relationship()
    unit_kerja: Mapped["UnitKerja"] = relationship()


class FasilitasRuangan(Base):
    __tablename__ = "fasilitas_ruangan"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kode_ruangan: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    nama_ruangan: Mapped[str] = mapped_column(String(150), nullable=False)
    lokasi_gedung: Mapped[str] = mapped_column(String(120), nullable=False)
    lantai: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    kapasitas: Mapped[int] = mapped_column(Integer, nullable=False)
    fasilitas_detail: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (CheckConstraint("kapasitas > 0", name="chk_ruangan_kapasitas_positive"),)


class Pemateri(Base):
    __tablename__ = "pemateri"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", onupdate="CASCADE", ondelete="SET NULL"), unique=True
    )
    nama_pemateri: Mapped[str] = mapped_column(String(150), nullable=False)
    nip: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    spesialisasi: Mapped[str] = mapped_column(String(200), nullable=False)
    max_jam_mengajar_mingguan: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("24.00"))
    email: Mapped[str] = mapped_column(String(180), nullable=False)
    no_whatsapp: Mapped[str | None] = mapped_column(String(25))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Permohonan(Base):
    __tablename__ = "permohonan"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nomor_tiket: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    unit_kerja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("unit_kerja.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    judul_pelatihan: Mapped[str] = mapped_column(String(220), nullable=False)
    jenis_kegiatan: Mapped[str] = mapped_column(String(80), nullable=False)
    jumlah_peserta: Mapped[int] = mapped_column(Integer, nullable=False)
    catatan_pemohon: Mapped[str | None] = mapped_column(Text)
    status_approval: Mapped[ApprovalStatusEnum] = mapped_column(
        SqlEnum(ApprovalStatusEnum, name="approval_status_enum", create_type=False),
        nullable=False,
        default=ApprovalStatusEnum.MENUNGGU_VERIFIKASI,
    )
    current_approval_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)

    # SLA Tracking timestamps (2x24 jam = 48h target)
    waktu_pengajuan: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sla_verifikasi_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sla_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_escalated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # TTE Signature metadata
    tte_document_hash: Mapped[str | None] = mapped_column(String(128))
    tte_signed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", onupdate="CASCADE", ondelete="SET NULL")
    )
    tte_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    reservasi: Mapped["JadwalReservasi"] = relationship(back_populates="permohonan", uselist=False, cascade="all, delete-orphan")
    approval_logs: Mapped[list["ApprovalLog"]] = relationship(back_populates="permohonan", cascade="all, delete-orphan")


class JadwalReservasi(Base):
    __tablename__ = "jadwal_reservasi"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permohonan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permohonan.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    ruangan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fasilitas_ruangan.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    pemateri_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pemateri.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    waktu_mulai: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    waktu_selesai: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status_slot: Mapped[ReservationSlotStatusEnum] = mapped_column(
        SqlEnum(ReservationSlotStatusEnum, name="reservation_slot_status_enum", create_type=False),
        nullable=False,
        default=ReservationSlotStatusEnum.LOCKED_PENDING,
    )
    rentang_waktu: Mapped[Any] = mapped_column(
        TSTZRANGE,
        Computed("tstzrange(waktu_mulai, waktu_selesai, '[)')", persisted=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    permohonan: Mapped["Permohonan"] = relationship(back_populates="reservasi")
    ruangan: Mapped["FasilitasRuangan"] = relationship()
    pemateri: Mapped["Pemateri"] = relationship()

    __table_args__ = (
        CheckConstraint("waktu_selesai > waktu_mulai", name="chk_valid_time_range"),
        Index(
            "idx_jadwal_ruangan_waktu",
            "ruangan_id",
            "waktu_mulai",
            "waktu_selesai",
            postgresql_where=text("status_slot IN ('LOCKED_PENDING', 'CONFIRMED')"),
        ),
        Index(
            "idx_jadwal_pemateri_waktu",
            "pemateri_id",
            "waktu_mulai",
            "waktu_selesai",
            postgresql_where=text("status_slot IN ('LOCKED_PENDING', 'CONFIRMED')"),
        ),
    )


class ApprovalLog(Base):
    __tablename__ = "approval_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permohonan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permohonan.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", onupdate="CASCADE", ondelete="SET NULL")
    )
    action: Mapped[ApprovalActionEnum] = mapped_column(
        SqlEnum(ApprovalActionEnum, name="approval_action_enum", create_type=False), nullable=False
    )
    previous_status: Mapped[ApprovalStatusEnum | None] = mapped_column(
        SqlEnum(ApprovalStatusEnum, name="approval_status_enum", create_type=False)
    )
    new_status: Mapped[ApprovalStatusEnum] = mapped_column(
        SqlEnum(ApprovalStatusEnum, name="approval_status_enum", create_type=False), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    permohonan: Mapped["Permohonan"] = relationship(back_populates="approval_logs")


class SlaEscalation(Base):
    __tablename__ = "sla_escalations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permohonan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("permohonan.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    escalation_level: Mapped[SlaEscalationLevelEnum] = mapped_column(
        SqlEnum(SlaEscalationLevelEnum, name="sla_escalation_level_enum", create_type=False),
        nullable=False,
    )
    target_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notified_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", onupdate="CASCADE", ondelete="SET NULL")
    )
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
