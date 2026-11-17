export type RoleCode = 'PEMOHON' | 'VERIFIKATOR' | 'PIMPINAN' | 'SUPER_ADMIN';

export type ApprovalStatus =
  | 'DRAFT'
  | 'MENUNGGU_VERIFIKASI'
  | 'PERLU_REVISI'
  | 'MENUNGGU_APPROVAL_PIMPINAN'
  | 'DISETUJUI_TTE'
  | 'DITOLAK'
  | 'DIBATALKAN';

export type ReservationSlotStatus = 'LOCKED_PENDING' | 'CONFIRMED' | 'RELEASED';

export type ApprovalAction =
  | 'SUBMIT'
  | 'RESUBMIT'
  | 'VERIFY_FORWARD'
  | 'REQUEST_REVISION'
  | 'APPROVE_TTE'
  | 'REJECT'
  | 'CANCEL'
  | 'AUTO_ESCALATE';

export type SlaHealthStatus = 'AMAN' | 'WARNING' | 'TERLEWAT' | 'SELESAI';

export interface UnitKerja {
  id: string;
  kodeUnit: string;
  namaUnit: string;
  eselonLevel: string;
}

export interface AppUser {
  id: string;
  nip: string;
  nama: string;
  role: RoleCode;
  roleLabel: string;
  unitKerjaId: string;
  unitKerjaNama: string;
  email: string;
  noWhatsapp: string;
  isActive: boolean;
}

export interface FasilitasRuangan {
  id: string;
  kodeRuangan: string;
  namaRuangan: string;
  lokasiGedung: string;
  lantai: number;
  kapasitas: number;
  fasilitasDetail: {
    proyektor: boolean;
    ac: boolean;
    audio: boolean;
    videoConf: boolean;
    layoutDefault: string;
  };
  isActive: boolean;
}

export interface Pemateri {
  id: string;
  namaPemateri: string;
  nip: string;
  spesialisasi: string;
  maxJamMengajarMingguan: number;
  email: string;
  noWhatsapp: string;
  isActive: boolean;
}

export interface Permohonan {
  id: string;
  nomorTiket: string;
  userId: string;
  pemohonNama: string;
  unitKerjaId: string;
  unitKerjaNama: string;
  judulPelatihan: string;
  jenisKegiatan: 'Diklat Teknis' | 'Workshop SPBE' | 'Bimbingan Teknis' | 'Rapat Koordinasi';
  jumlahPeserta: number;
  catatanPemohon: string;
  statusApproval: ApprovalStatus;
  currentApprovalLevel: 1 | 2 | 3;
  waktuPengajuan: string; // ISO string
  slaVerifikasiDeadline: string; // ISO string
  slaDeadline: string; // ISO string
  isEscalated: boolean;
  escalatedAt?: string;
  resolvedAt?: string;
  tteDocumentHash?: string;
  tteSignedBy?: string;
  tteSignedAt?: string;
}

export interface JadwalReservasi {
  id: string;
  permohonanId: string;
  ruanganId: string;
  pemateriId: string;
  waktuMulai: string; // ISO string
  waktuSelesai: string; // ISO string
  statusSlot: ReservationSlotStatus;
}

export interface ApprovalLog {
  id: string;
  permohonanId: string;
  userId: string | null;
  actorName: string;
  actorRole: string;
  action: ApprovalAction;
  previousStatus: ApprovalStatus | null;
  newStatus: ApprovalStatus;
  note: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  permohonanId: string;
  nomorTiket: string;
  channel: 'INTERNAL' | 'WHATSAPP' | 'EMAIL';
  recipientContact: string;
  title: string;
  messageBody: string;
  createdAt: string;
}
