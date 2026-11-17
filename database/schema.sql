-- ============================================================================
-- SIMPEL PINTU (Sistem Informasi Manajemen Pelatihan Terpadu - 1 Pintu)
-- Complete PostgreSQL 15+ DDL Script
-- Architecture: Normalized 3NF, Race-Condition-Proof GiST Exclusion Constraints,
--               Multi-level E-Approval, SLA Tracking & Immutable Audit Trail
-- ============================================================================

-- 1. EXTENSIONS
-- pgcrypto: UUID primary key generation (gen_random_uuid)
-- btree_gist: Enables composite GiST indexes combining scalar columns (BIGINT/UUID)
--             with TSTZRANGE for atomic overlap prevention (NFR-02).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. CUSTOM ENUM TYPES
DO $$ BEGIN
  CREATE TYPE approval_status_enum AS ENUM (
    'DRAFT',
    'MENUNGGU_VERIFIKASI',
    'PERLU_REVISI',
    'MENUNGGU_APPROVAL_PIMPINAN',
    'DISETUJUI_TTE',
    'DITOLAK',
    'DIBATALKAN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reservation_slot_status_enum AS ENUM (
    'LOCKED_PENDING', -- Slot dikunci sementara selama proses verifikasi & approval
    'CONFIRMED',      -- Slot resmi terkunci setelah TTE Pimpinan
    'RELEASED'        -- Slot dilepas otomatis jika permohonan ditolak/dibatalkan
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_action_enum AS ENUM (
    'SUBMIT',
    'RESUBMIT',
    'VERIFY_FORWARD',
    'REQUEST_REVISION',
    'APPROVE_TTE',
    'REJECT',
    'CANCEL',
    'AUTO_ESCALATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sla_escalation_level_enum AS ENUM (
    'WARNING_75_PCT',
    'BREACHED_100_PCT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel_enum AS ENUM (
    'INTERNAL',
    'WHATSAPP',
    'EMAIL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. MASTER LOOKUP TABLES (Normalized 3NF)

-- 3.1 Master Roles (RBAC)
CREATE TABLE roles (
  id              SMALLSERIAL PRIMARY KEY,
  code            VARCHAR(32) NOT NULL UNIQUE, -- 'SUPER_ADMIN', 'VERIFIKATOR', 'PEMOHON', 'PIMPINAN'
  name            VARCHAR(80) NOT NULL,
  description     TEXT,
  sla_priority    SMALLINT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Master Unit Kerja (Instansi / Biro / Bidang)
CREATE TABLE unit_kerja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_unit       VARCHAR(24) NOT NULL UNIQUE,
  nama_unit       VARCHAR(150) NOT NULL,
  eselon_level    VARCHAR(32),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 Users (Pemohon, Verifikator, Pimpinan, Super Admin)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip             VARCHAR(30) NOT NULL UNIQUE,
  nama            VARCHAR(150) NOT NULL,
  role_id         SMALLINT NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_kerja_id   UUID NOT NULL REFERENCES unit_kerja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  email           VARCHAR(180) NOT NULL UNIQUE,
  no_whatsapp     VARCHAR(25),
  password_hash   TEXT NOT NULL, -- Argon2id / Bcrypt hash untuk JWT Auth
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 Master Fasilitas Ruangan
CREATE TABLE fasilitas_ruangan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_ruangan      VARCHAR(32) NOT NULL UNIQUE,
  nama_ruangan      VARCHAR(150) NOT NULL,
  lokasi_gedung     VARCHAR(120) NOT NULL,
  lantai            SMALLINT NOT NULL DEFAULT 1,
  kapasitas         INTEGER NOT NULL CHECK (kapasitas > 0),
  -- JSONB menyimpan atribut fleksibel seperti proyektor, AC, audio, video_conf
  fasilitas_detail  JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.5 Master Pemateri (Instruktur / Widyaiswara / Narasumber)
CREATE TABLE pemateri (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID UNIQUE REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  nama_pemateri             VARCHAR(150) NOT NULL,
  nip                       VARCHAR(30) NOT NULL UNIQUE,
  spesialisasi              VARCHAR(200) NOT NULL,
  max_jam_mengajar_mingguan NUMERIC(5,2) NOT NULL DEFAULT 24.00 CHECK (max_jam_mengajar_mingguan > 0),
  email                     VARCHAR(180) NOT NULL,
  no_whatsapp               VARCHAR(25),
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CORE TRANSACTIONAL TABLES

-- 4.1 Permohonan Pelatihan (Transaksi Booking 1 Pintu & SLA State)
CREATE TABLE permohonan (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_tiket               VARCHAR(32) NOT NULL UNIQUE, -- Contoh: SP-2026-0042
  user_id                   UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_kerja_id             UUID NOT NULL REFERENCES unit_kerja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  judul_pelatihan           VARCHAR(220) NOT NULL,
  jenis_kegiatan            VARCHAR(80) NOT NULL,        -- Diklat Teknis, Workshop, Rapat Koordinasi, Bimtek
  jumlah_peserta            INTEGER NOT NULL CHECK (jumlah_peserta > 0),
  catatan_pemohon           TEXT,
  status_approval           approval_status_enum NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
  current_approval_level    SMALLINT NOT NULL DEFAULT 1, -- 1: Verifikator, 2: Pimpinan, 3: Final

  -- Pelacakan SLA Berjenjang (misal: total target 2x24 jam = 48 jam)
  waktu_pengajuan           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_verifikasi_deadline   TIMESTAMPTZ NOT NULL,        -- Target tahap 1 (misal +16 jam kerja / +24 jam)
  sla_deadline              TIMESTAMPTZ NOT NULL,        -- Target final approval (2x24 jam)
  is_escalated              BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at              TIMESTAMPTZ,
  resolved_at               TIMESTAMPTZ,

  -- Metadata Tanda Tangan Elektronik (TTE)
  tte_document_hash         VARCHAR(128),
  tte_signed_by             UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  tte_signed_at             TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sla_order CHECK (sla_verifikasi_deadline <= sla_deadline)
);

-- 4.2 Jadwal Reservasi (Conflict Resolver & Smart Calendar Slot Mapping)
-- Menggunakan TSTZRANGE + EXCLUDE USING GIST untuk mencegah double-booking
-- baik pada tingkat ruangan maupun pemateri secara atomik (Zero Race Condition).
CREATE TABLE jadwal_reservasi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id   UUID NOT NULL REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE CASCADE,
  ruangan_id      UUID NOT NULL REFERENCES fasilitas_ruangan(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  pemateri_id     UUID NOT NULL REFERENCES pemateri(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  waktu_mulai     TIMESTAMPTZ NOT NULL,
  waktu_selesai   TIMESTAMPTZ NOT NULL,
  status_slot     reservation_slot_status_enum NOT NULL DEFAULT 'LOCKED_PENDING',

  -- Half-open interval [waktu_mulai, waktu_selesai):
  -- Memungkinkan sesi 08:00-10:00 dan 10:00-12:00 berjalan berurutan tanpa bentrok.
  rentang_waktu   TSTZRANGE GENERATED ALWAYS AS (
    tstzrange(waktu_mulai, waktu_selesai, '[)')
  ) STORED,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_valid_time_range CHECK (waktu_selesai > waktu_mulai),

  -- EXCLUSION CONSTRAINT 1: Mencegah 2 permohonan aktif memesan RUANGAN yang sama di waktu overlap
  CONSTRAINT excl_no_room_time_overlap
    EXCLUDE USING gist (
      ruangan_id WITH =,
      rentang_waktu WITH &&
    )
    WHERE (status_slot IN ('LOCKED_PENDING', 'CONFIRMED')),

  -- EXCLUSION CONSTRAINT 2: Mencegah 2 permohonan aktif menugaskan PEMATERI yang sama di waktu overlap
  CONSTRAINT excl_no_instructor_time_overlap
    EXCLUDE USING gist (
      pemateri_id WITH =,
      rentang_waktu WITH &&
    )
    WHERE (status_slot IN ('LOCKED_PENDING', 'CONFIRMED'))
);

-- 5. AUDIT TRAIL, SLA ESCALATION & OMNICHANNEL NOTIFICATION TABLES

-- 5.1 Approval Logs (Immutable Audit Trail - NFR-04)
CREATE TABLE approval_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id    UUID NOT NULL REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL, -- NULL jika aksi sistem (AUTO_ESCALATE)
  action           approval_action_enum NOT NULL,
  previous_status  approval_status_enum,
  new_status       approval_status_enum NOT NULL,
  note             TEXT,
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.2 SLA Escalations History
CREATE TABLE sla_escalations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id        UUID NOT NULL REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE CASCADE,
  escalation_level     sla_escalation_level_enum NOT NULL,
  target_deadline_at   TIMESTAMPTZ NOT NULL,
  notified_user_id     UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  triggered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  CONSTRAINT uq_permohonan_escalation UNIQUE (permohonan_id, escalation_level)
);

-- 5.3 Omnichannel Notifications Log (WhatsApp / Email / Internal)
CREATE TABLE notifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  permohonan_id      UUID REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE SET NULL,
  channel            notification_channel_enum NOT NULL,
  recipient_contact  VARCHAR(180) NOT NULL,
  title              VARCHAR(160) NOT NULL,
  message_body       TEXT NOT NULL,
  is_read            BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_status    VARCHAR(24) NOT NULL DEFAULT 'SENT', -- 'PENDING', 'SENT', 'FAILED'
  sent_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. PERFORMANCE INDEXES (Conflict Detection < 2s & Dashboard Queries)

-- Composite & Partial GiST index untuk pencarian ketersediaan cepat pada Smart Calendar
CREATE INDEX idx_jadwal_active_range
  ON jadwal_reservasi USING gist (rentang_waktu)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

CREATE INDEX idx_jadwal_ruangan_waktu
  ON jadwal_reservasi (ruangan_id, waktu_mulai, waktu_selesai)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

CREATE INDEX idx_jadwal_pemateri_waktu
  ON jadwal_reservasi (pemateri_id, waktu_mulai, waktu_selesai)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

-- Index untuk SLA worker & antrean approval berjenjang
CREATE INDEX idx_permohonan_sla_pending
  ON permohonan (status_approval, sla_deadline)
  WHERE status_approval IN ('MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL_PIMPINAN');

CREATE INDEX idx_permohonan_unit_user
  ON permohonan (unit_kerja_id, user_id, waktu_pengajuan DESC);

CREATE INDEX idx_approval_logs_permohonan_time
  ON approval_logs (permohonan_id, created_at ASC);

CREATE INDEX idx_fasilitas_detail_gin
  ON fasilitas_ruangan USING gin (fasilitas_detail);

-- 7. TRIGGERS & REAL-TIME SLA VIEW

-- Trigger otomatis memperbarui kolom updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_ruangan_updated_at
  BEFORE UPDATE ON fasilitas_ruangan FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_pemateri_updated_at
  BEFORE UPDATE ON pemateri FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_permohonan_updated_at
  BEFORE UPDATE ON permohonan FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_jadwal_updated_at
  BEFORE UPDATE ON jadwal_reservasi FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Trigger sinkronisasi otomatis status_slot pada jadwal_reservasi saat permohonan ditolak/dibatalkan/disetujui
CREATE OR REPLACE FUNCTION fn_sync_slot_status_from_permohonan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_approval IN ('DITOLAK', 'DIBATALKAN') THEN
    UPDATE jadwal_reservasi
      SET status_slot = 'RELEASED'
      WHERE permohonan_id = NEW.id AND status_slot <> 'RELEASED';
  ELSIF NEW.status_approval = 'DISETUJUI_TTE' THEN
    UPDATE jadwal_reservasi
      SET status_slot = 'CONFIRMED'
      WHERE permohonan_id = NEW.id AND status_slot = 'LOCKED_PENDING';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_permohonan_sync_slot
  AFTER UPDATE OF status_approval ON permohonan
  FOR EACH ROW
  WHEN (OLD.status_approval IS DISTINCT FROM NEW.status_approval)
  EXECUTE FUNCTION fn_sync_slot_status_from_permohonan();

-- View real-time status SLA (Hijau: AMAN, Kuning: WARNING >=75%, Merah: TERLEWAT >100%)
CREATE OR REPLACE VIEW v_permohonan_sla_monitor AS
SELECT
  p.id,
  p.nomor_tiket,
  p.judul_pelatihan,
  p.status_approval,
  p.waktu_pengajuan,
  p.sla_verifikasi_deadline,
  p.sla_deadline,
  p.is_escalated,
  EXTRACT(EPOCH FROM (p.sla_deadline - NOW())) / 3600.0 AS sisa_jam_sla,
  CASE
    WHEN p.status_approval IN ('DISETUJUI_TTE', 'DITOLAK', 'DIBATALKAN') THEN 'SELESAI'
    WHEN NOW() > p.sla_deadline THEN 'TERLEWAT'
    WHEN NOW() >= p.waktu_pengajuan + ((p.sla_deadline - p.waktu_pengajuan) * 0.75) THEN 'WARNING'
    ELSE 'AMAN'
  END AS sla_health_status
FROM permohonan p;
