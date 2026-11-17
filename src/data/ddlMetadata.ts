export interface DdlTableSummary {
  tableName: string;
  category: 'Master' | 'Transaksi' | 'Audit & SLA';
  purpose: string;
  keyColumns: string[];
  constraints: string[];
}

export const DDL_TABLE_SUMMARIES: DdlTableSummary[] = [
  {
    tableName: 'roles',
    category: 'Master',
    purpose: 'Tabel referensi RBAC instansi (PEMOHON, VERIFIKATOR, PIMPINAN, SUPER_ADMIN).',
    keyColumns: ['id (PK)', 'code (UNIQUE)', 'name', 'sla_priority'],
    constraints: ['UNIQUE(code)'],
  },
  {
    tableName: 'unit_kerja',
    category: 'Master',
    purpose: 'Normalisasi unit organisasi/eselon untuk isolasi data antar unit (NFR-03).',
    keyColumns: ['id (UUID PK)', 'kode_unit (UNIQUE)', 'nama_unit', 'eselon_level'],
    constraints: ['UNIQUE(kode_unit)'],
  },
  {
    tableName: 'users',
    category: 'Master',
    purpose: 'Akun ASN/pegawai dengan kredensial JWT & kontak omnichannel (WA/Email).',
    keyColumns: ['id (UUID PK)', 'nip (UNIQUE)', 'role_id (FK)', 'unit_kerja_id (FK)', 'email (UNIQUE)'],
    constraints: ['FK role_id -> roles(id)', 'FK unit_kerja_id -> unit_kerja(id)'],
  },
  {
    tableName: 'fasilitas_ruangan',
    category: 'Master',
    purpose: 'Master ruangan pelatihan beserta kapasitas & atribut JSONB (Proyektor, AC, Audio, VideoConf).',
    keyColumns: ['id (UUID PK)', 'kode_ruangan (UNIQUE)', 'nama_ruangan', 'kapasitas', 'fasilitas_detail (JSONB)'],
    constraints: ['CHECK (kapasitas > 0)', 'GIN Index on fasilitas_detail'],
  },
  {
    tableName: 'pemateri',
    category: 'Master',
    purpose: 'Master instruktur/widyaiswara beserta batas jam mengajar mingguan.',
    keyColumns: ['id (UUID PK)', 'nip (UNIQUE)', 'nama_pemateri', 'spesialisasi', 'max_jam_mengajar_mingguan'],
    constraints: ['FK user_id -> users(id)', 'CHECK (max_jam_mengajar_mingguan > 0)'],
  },
  {
    tableName: 'permohonan',
    category: 'Transaksi',
    purpose: 'Transaksi pengajuan pelatihan 1 pintu, argo SLA berjenjang, status approval & hash TTE.',
    keyColumns: ['id (UUID PK)', 'nomor_tiket (UNIQUE)', 'user_id (FK)', 'status_approval', 'sla_verifikasi_deadline', 'sla_deadline'],
    constraints: ['CHECK (jumlah_peserta > 0)', 'CHECK (sla_verifikasi_deadline <= sla_deadline)'],
  },
  {
    tableName: 'jadwal_reservasi',
    category: 'Transaksi',
    purpose: 'Pemetaan ruang, pemateri & rentang waktu dengan proteksi bentrok atomik level engine PostgreSQL.',
    keyColumns: ['id (UUID PK)', 'permohonan_id (FK)', 'ruangan_id (FK)', 'pemateri_id (FK)', 'rentang_waktu (TSTZRANGE STORED)', 'status_slot'],
    constraints: [
      'EXCLUDE USING gist (ruangan_id WITH =, rentang_waktu WITH &&) WHERE active',
      'EXCLUDE USING gist (pemateri_id WITH =, rentang_waktu WITH &&) WHERE active',
      'CHECK (waktu_selesai > waktu_mulai)',
    ],
  },
  {
    tableName: 'approval_logs',
    category: 'Audit & SLA',
    purpose: 'Jejak audit permanen (immutable) untuk setiap submit, disposisi, revisi, TTE & eskalasi.',
    keyColumns: ['id (UUID PK)', 'permohonan_id (FK)', 'user_id (FK)', 'action', 'previous_status', 'new_status', 'created_at'],
    constraints: ['FK permohonan_id -> permohonan(id) ON DELETE CASCADE'],
  },
  {
    tableName: 'sla_escalations',
    category: 'Audit & SLA',
    purpose: 'Pencatatan peringatan SLA (75%) dan pelanggaran batas waktu (100%) agar tidak duplikat.',
    keyColumns: ['id (UUID PK)', 'permohonan_id (FK)', 'escalation_level', 'target_deadline_at', 'triggered_at'],
    constraints: ['UNIQUE (permohonan_id, escalation_level)'],
  },
  {
    tableName: 'notifications',
    category: 'Audit & SLA',
    purpose: 'Antrean pengiriman notifikasi real-time via WhatsApp, Email, dan portal internal.',
    keyColumns: ['id (UUID PK)', 'user_id (FK)', 'permohonan_id (FK)', 'channel', 'delivery_status'],
    constraints: ['FK user_id -> users(id)'],
  },
];

export const POSTGRESQL_DDL_SCRIPT = `-- ============================================================================
-- SIMPEL PINTU (Sistem Informasi Manajemen Pelatihan Terpadu - 1 Pintu)
-- Complete PostgreSQL 15+ DDL Script
-- Architecture: Normalized 3NF, Race-Condition-Proof GiST Exclusion Constraints,
--               Multi-level E-Approval, SLA Tracking & Immutable Audit Trail
-- ============================================================================

-- 1. EXTENSIONS
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
    'LOCKED_PENDING',
    'CONFIRMED',
    'RELEASED'
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
CREATE TABLE roles (
  id              SMALLSERIAL PRIMARY KEY,
  code            VARCHAR(32) NOT NULL UNIQUE,
  name            VARCHAR(80) NOT NULL,
  description     TEXT,
  sla_priority    SMALLINT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE unit_kerja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_unit       VARCHAR(24) NOT NULL UNIQUE,
  nama_unit       VARCHAR(150) NOT NULL,
  eselon_level    VARCHAR(32),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip             VARCHAR(30) NOT NULL UNIQUE,
  nama            VARCHAR(150) NOT NULL,
  role_id         SMALLINT NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_kerja_id   UUID NOT NULL REFERENCES unit_kerja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  email           VARCHAR(180) NOT NULL UNIQUE,
  no_whatsapp     VARCHAR(25),
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fasilitas_ruangan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_ruangan      VARCHAR(32) NOT NULL UNIQUE,
  nama_ruangan      VARCHAR(150) NOT NULL,
  lokasi_gedung     VARCHAR(120) NOT NULL,
  lantai            SMALLINT NOT NULL DEFAULT 1,
  kapasitas         INTEGER NOT NULL CHECK (kapasitas > 0),
  fasilitas_detail  JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
CREATE TABLE permohonan (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_tiket               VARCHAR(32) NOT NULL UNIQUE,
  user_id                   UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_kerja_id             UUID NOT NULL REFERENCES unit_kerja(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  judul_pelatihan           VARCHAR(220) NOT NULL,
  jenis_kegiatan            VARCHAR(80) NOT NULL,
  jumlah_peserta            INTEGER NOT NULL CHECK (jumlah_peserta > 0),
  catatan_pemohon           TEXT,
  status_approval           approval_status_enum NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
  current_approval_level    SMALLINT NOT NULL DEFAULT 1,
  waktu_pengajuan           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_verifikasi_deadline   TIMESTAMPTZ NOT NULL,
  sla_deadline              TIMESTAMPTZ NOT NULL,
  is_escalated              BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at              TIMESTAMPTZ,
  resolved_at               TIMESTAMPTZ,
  tte_document_hash         VARCHAR(128),
  tte_signed_by             UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  tte_signed_at             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sla_order CHECK (sla_verifikasi_deadline <= sla_deadline)
);

CREATE TABLE jadwal_reservasi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id   UUID NOT NULL REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE CASCADE,
  ruangan_id      UUID NOT NULL REFERENCES fasilitas_ruangan(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  pemateri_id     UUID NOT NULL REFERENCES pemateri(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  waktu_mulai     TIMESTAMPTZ NOT NULL,
  waktu_selesai   TIMESTAMPTZ NOT NULL,
  status_slot     reservation_slot_status_enum NOT NULL DEFAULT 'LOCKED_PENDING',
  rentang_waktu   TSTZRANGE GENERATED ALWAYS AS (
    tstzrange(waktu_mulai, waktu_selesai, '[)')
  ) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_valid_time_range CHECK (waktu_selesai > waktu_mulai),
  CONSTRAINT excl_no_room_time_overlap
    EXCLUDE USING gist (ruangan_id WITH =, rentang_waktu WITH &&)
    WHERE (status_slot IN ('LOCKED_PENDING', 'CONFIRMED')),
  CONSTRAINT excl_no_instructor_time_overlap
    EXCLUDE USING gist (pemateri_id WITH =, rentang_waktu WITH &&)
    WHERE (status_slot IN ('LOCKED_PENDING', 'CONFIRMED'))
);

-- 5. AUDIT TRAIL, SLA ESCALATION & OMNICHANNEL NOTIFICATION TABLES
CREATE TABLE approval_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id    UUID NOT NULL REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action           approval_action_enum NOT NULL,
  previous_status  approval_status_enum,
  new_status       approval_status_enum NOT NULL,
  note             TEXT,
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE notifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  permohonan_id      UUID REFERENCES permohonan(id) ON UPDATE CASCADE ON DELETE SET NULL,
  channel            notification_channel_enum NOT NULL,
  recipient_contact  VARCHAR(180) NOT NULL,
  title              VARCHAR(160) NOT NULL,
  message_body       TEXT NOT NULL,
  is_read            BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_status    VARCHAR(24) NOT NULL DEFAULT 'SENT',
  sent_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. PERFORMANCE INDEXES
CREATE INDEX idx_jadwal_active_range
  ON jadwal_reservasi USING gist (rentang_waktu)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

CREATE INDEX idx_jadwal_ruangan_waktu
  ON jadwal_reservasi (ruangan_id, waktu_mulai, waktu_selesai)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

CREATE INDEX idx_jadwal_pemateri_waktu
  ON jadwal_reservasi (pemateri_id, waktu_mulai, waktu_selesai)
  WHERE status_slot IN ('LOCKED_PENDING', 'CONFIRMED');

CREATE INDEX idx_permohonan_sla_pending
  ON permohonan (status_approval, sla_deadline)
  WHERE status_approval IN ('MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL_PIMPINAN');

CREATE INDEX idx_permohonan_unit_user
  ON permohonan (unit_kerja_id, user_id, waktu_pengajuan DESC);

CREATE INDEX idx_approval_logs_permohonan_time
  ON approval_logs (permohonan_id, created_at ASC);

CREATE INDEX idx_fasilitas_detail_gin
  ON fasilitas_ruangan USING gin (fasilitas_detail);

-- 7. TRIGGERS & SLA MONITORING VIEW
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_ruangan_updated_at BEFORE UPDATE ON fasilitas_ruangan FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_pemateri_updated_at BEFORE UPDATE ON pemateri FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_permohonan_updated_at BEFORE UPDATE ON permohonan FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_jadwal_updated_at BEFORE UPDATE ON jadwal_reservasi FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_sync_slot_status_from_permohonan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_approval IN ('DITOLAK', 'DIBATALKAN') THEN
    UPDATE jadwal_reservasi SET status_slot = 'RELEASED' WHERE permohonan_id = NEW.id AND status_slot <> 'RELEASED';
  ELSIF NEW.status_approval = 'DISETUJUI_TTE' THEN
    UPDATE jadwal_reservasi SET status_slot = 'CONFIRMED' WHERE permohonan_id = NEW.id AND status_slot = 'LOCKED_PENDING';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_permohonan_sync_slot
  AFTER UPDATE OF status_approval ON permohonan
  FOR EACH ROW
  WHEN (OLD.status_approval IS DISTINCT FROM NEW.status_approval)
  EXECUTE FUNCTION fn_sync_slot_status_from_permohonan();

CREATE OR REPLACE VIEW v_permohonan_sla_monitor AS
SELECT
  p.id, p.nomor_tiket, p.judul_pelatihan, p.status_approval,
  p.waktu_pengajuan, p.sla_verifikasi_deadline, p.sla_deadline, p.is_escalated,
  EXTRACT(EPOCH FROM (p.sla_deadline - NOW())) / 3600.0 AS sisa_jam_sla,
  CASE
    WHEN p.status_approval IN ('DISETUJUI_TTE', 'DITOLAK', 'DIBATALKAN') THEN 'SELESAI'
    WHEN NOW() > p.sla_deadline THEN 'TERLEWAT'
    WHEN NOW() >= p.waktu_pengajuan + ((p.sla_deadline - p.waktu_pengajuan) * 0.75) THEN 'WARNING'
    ELSE 'AMAN'
  END AS sla_health_status
FROM permohonan p;`;
