import type {
  AppUser,
  ApprovalLog,
  FasilitasRuangan,
  JadwalReservasi,
  NotificationItem,
  Pemateri,
  Permohonan,
  UnitKerja,
} from '../types/simpel';

export const UNIT_KERJA_LIST: UnitKerja[] = [
  { id: 'unit-1', kodeUnit: 'BIRO-SDM', namaUnit: 'Biro Sumber Daya Manusia & Organisasi', eselonLevel: 'Eselon II' },
  { id: 'unit-2', kodeUnit: 'PUSDATIN', namaUnit: 'Pusat Data dan Informasi (SPBE)', eselonLevel: 'Eselon II' },
  { id: 'unit-3', kodeUnit: 'INSPEKTORAT', namaUnit: 'Inspektorat Jenderal Pengawasan', eselonLevel: 'Eselon I' },
  { id: 'unit-4', kodeUnit: 'BALAI-DIKLAT', namaUnit: 'Balai Pendidikan & Pelatihan Aparatur', eselonLevel: 'Eselon III' },
];

export const INITIAL_USERS: AppUser[] = [
  {
    id: 'usr-pemohon',
    nip: '199204152018011002',
    nama: 'Andi Pratama, S.Kom',
    role: 'PEMOHON',
    roleLabel: 'Pemohon (Unit Kerja)',
    unitKerjaId: 'unit-2',
    unitKerjaNama: 'Pusat Data dan Informasi (SPBE)',
    email: 'andi.pratama@instansi.go.id',
    noWhatsapp: '+6281234567001',
    isActive: true,
  },
  {
    id: 'usr-verifikator',
    nip: '198811032014022001',
    nama: 'Nadia Kusumawati, S.T',
    role: 'VERIFIKATOR',
    roleLabel: 'Verifikator (Admin/Prakom)',
    unitKerjaId: 'unit-4',
    unitKerjaNama: 'Balai Pendidikan & Pelatihan Aparatur',
    email: 'nadia.prakom@instansi.go.id',
    noWhatsapp: '+6281234567002',
    isActive: true,
  },
  {
    id: 'usr-pimpinan',
    nip: '197506212000031001',
    nama: 'Drs. Bambang Suryadi, M.Si',
    role: 'PIMPINAN',
    roleLabel: 'Pimpinan (Kadis / Eselon II)',
    unitKerjaId: 'unit-1',
    unitKerjaNama: 'Biro Sumber Daya Manusia & Organisasi',
    email: 'bambang.kadis@instansi.go.id',
    noWhatsapp: '+6281234567003',
    isActive: true,
  },
  {
    id: 'usr-admin',
    nip: '198501122010121004',
    nama: 'Rizky Maulana, M.TI',
    role: 'SUPER_ADMIN',
    roleLabel: 'Super Admin Sistem',
    unitKerjaId: 'unit-2',
    unitKerjaNama: 'Pusat Data dan Informasi (SPBE)',
    email: 'rizky.sysadmin@instansi.go.id',
    noWhatsapp: '+6281234567004',
    isActive: true,
  },
];

export const INITIAL_ROOMS: FasilitasRuangan[] = [
  {
    id: 'room-1',
    kodeRuangan: 'AUD-01',
    namaRuangan: 'Ruang Auditorium Utama',
    lokasiGedung: 'Gedung Utama Lt. 1',
    lantai: 1,
    kapasitas: 120,
    fasilitasDetail: {
      proyektor: true,
      ac: true,
      audio: true,
      videoConf: true,
      layoutDefault: 'Teater',
    },
    isActive: true,
  },
  {
    id: 'room-2',
    kodeRuangan: 'LAB-SPBE-A',
    namaRuangan: 'Lab Komputer SPBE A',
    lokasiGedung: 'Gedung Diklat Lt. 2',
    lantai: 2,
    kapasitas: 40,
    fasilitasDetail: {
      proyektor: true,
      ac: true,
      audio: true,
      videoConf: false,
      layoutDefault: 'Workstation',
    },
    isActive: true,
  },
  {
    id: 'room-3',
    kodeRuangan: 'RPT-EXEC-B',
    namaRuangan: 'Ruang Rapat Eksekutif B',
    lokasiGedung: 'Gedung Utama Lt. 3',
    lantai: 3,
    kapasitas: 25,
    fasilitasDetail: {
      proyektor: true,
      ac: true,
      audio: true,
      videoConf: true,
      layoutDefault: 'Boardroom',
    },
    isActive: true,
  },
  {
    id: 'room-4',
    kodeRuangan: 'KLS-201',
    namaRuangan: 'Ruang Kelas Diklat 201',
    lokasiGedung: 'Gedung Diklat Lt. 2',
    lantai: 2,
    kapasitas: 50,
    fasilitasDetail: {
      proyektor: true,
      ac: true,
      audio: false,
      videoConf: false,
      layoutDefault: 'Klasikal',
    },
    isActive: true,
  },
];

export const INITIAL_INSTRUCTORS: Pemateri[] = [
  {
    id: 'inst-1',
    namaPemateri: 'Dr. Hendra Wijaya, M.Kom',
    nip: '197908172005011003',
    spesialisasi: 'Arsitektur SPBE & Keamanan Siber',
    maxJamMengajarMingguan: 20,
    email: 'hendra.wijaya@instansi.go.id',
    noWhatsapp: '+6281199887701',
    isActive: true,
  },
  {
    id: 'inst-2',
    namaPemateri: 'Ir. Ratna Kusuma, M.T',
    nip: '198203242008012005',
    spesialisasi: 'Tata Kelola Data & PostgreSQL',
    maxJamMengajarMingguan: 18,
    email: 'ratna.kusuma@instansi.go.id',
    noWhatsapp: '+6281199887702',
    isActive: true,
  },
  {
    id: 'inst-3',
    namaPemateri: 'Budi Santoso, S.Sos, MPA',
    nip: '197612102003121002',
    spesialisasi: 'Manajemen ASN & Reformasi Birokrasi',
    maxJamMengajarMingguan: 16,
    email: 'budi.santoso@instansi.go.id',
    noWhatsapp: '+6281199887703',
    isActive: true,
  },
  {
    id: 'inst-4',
    namaPemateri: 'Siti Aminah, S.Kom, M.Sc',
    nip: '199005142015032004',
    spesialisasi: 'Audit Sistem Informasi & Compliance',
    maxJamMengajarMingguan: 20,
    email: 'siti.aminah@instansi.go.id',
    noWhatsapp: '+6281199887704',
    isActive: true,
  },
];

function atDayAndHour(base: Date, dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function addHours(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 3600 * 1000).toISOString();
}

export interface SimpelSeedState {
  permohonan: Permohonan[];
  reservations: JadwalReservasi[];
  logs: ApprovalLog[];
  notifications: NotificationItem[];
}

export function createInitialSeedState(now: Date = new Date()): SimpelSeedState {
  const permohonan: Permohonan[] = [
    {
      id: 'perm-1',
      nomorTiket: 'SP-2026-0101',
      userId: 'usr-pemohon',
      pemohonNama: 'Andi Pratama, S.Kom',
      unitKerjaId: 'unit-2',
      unitKerjaNama: 'Pusat Data dan Informasi (SPBE)',
      judulPelatihan: 'Bimtek Arsitektur SPBE & Zero-Trust Government Network',
      jenisKegiatan: 'Bimbingan Teknis',
      jumlahPeserta: 85,
      catatanPemohon: 'Membutuhkan audio wireless dan koneksi livestream untuk unit daerah.',
      statusApproval: 'DISETUJUI_TTE',
      currentApprovalLevel: 3,
      waktuPengajuan: addHours(now, -72),
      slaVerifikasiDeadline: addHours(now, -48),
      slaDeadline: addHours(now, -24),
      isEscalated: false,
      resolvedAt: addHours(now, -36),
      tteDocumentHash: 'TTE-SHA256-9A4B2C11-SP20260101',
      tteSignedBy: 'Drs. Bambang Suryadi, M.Si',
      tteSignedAt: addHours(now, -36),
    },
    {
      id: 'perm-2',
      nomorTiket: 'SP-2026-0102',
      userId: 'usr-pemohon',
      pemohonNama: 'Andi Pratama, S.Kom',
      unitKerjaId: 'unit-2',
      unitKerjaNama: 'Pusat Data dan Informasi (SPBE)',
      judulPelatihan: 'Workshop Optimasi PostgreSQL & GiST Indexing untuk Layanan Publik',
      jenisKegiatan: 'Workshop SPBE',
      jumlahPeserta: 32,
      catatanPemohon: 'Setiap workstation peserta memerlukan PostgreSQL 16 terpasang.',
      statusApproval: 'MENUNGGU_APPROVAL_PIMPINAN',
      currentApprovalLevel: 2,
      waktuPengajuan: addHours(now, -40), // 40h elapsed out of 48h -> 83% (WARNING)
      slaVerifikasiDeadline: addHours(now, -16),
      slaDeadline: addHours(now, 8),
      isEscalated: false,
    },
    {
      id: 'perm-3',
      nomorTiket: 'SP-2026-0103',
      userId: 'usr-admin',
      pemohonNama: 'Rizky Maulana, M.TI',
      unitKerjaId: 'unit-3',
      unitKerjaNama: 'Inspektorat Jenderal Pengawasan',
      judulPelatihan: 'Diklat Audit Sistem Informasi Berbasis Risiko & SPBE',
      jenisKegiatan: 'Diklat Teknis',
      jumlahPeserta: 42,
      catatanPemohon: 'Prioritas Q4 inspektorat sebelum evaluasi akhir tahun.',
      statusApproval: 'MENUNGGU_VERIFIKASI',
      currentApprovalLevel: 1,
      waktuPengajuan: addHours(now, -53), // 53h elapsed out of 48h -> TERLEWAT (-5h)
      slaVerifikasiDeadline: addHours(now, -29),
      slaDeadline: addHours(now, -5),
      isEscalated: true,
      escalatedAt: addHours(now, -5),
    },
    {
      id: 'perm-4',
      nomorTiket: 'SP-2026-0104',
      userId: 'usr-pemohon',
      pemohonNama: 'Andi Pratama, S.Kom',
      unitKerjaId: 'unit-1',
      unitKerjaNama: 'Biro Sumber Daya Manusia & Organisasi',
      judulPelatihan: 'Sosialisasi Reformasi Birokrasi Tematik & Kinerja ASN',
      jenisKegiatan: 'Rapat Koordinasi',
      jumlahPeserta: 22,
      catatanPemohon: 'Peserta dari perwakilan Eselon III seluruh unit kerja.',
      statusApproval: 'MENUNGGU_VERIFIKASI',
      currentApprovalLevel: 1,
      waktuPengajuan: addHours(now, -10), // 10h elapsed out of 48h -> AMAN
      slaVerifikasiDeadline: addHours(now, 14),
      slaDeadline: addHours(now, 38),
      isEscalated: false,
    },
    {
      id: 'perm-5',
      nomorTiket: 'SP-2026-0105',
      userId: 'usr-pemohon',
      pemohonNama: 'Andi Pratama, S.Kom',
      unitKerjaId: 'unit-4',
      unitKerjaNama: 'Balai Pendidikan & Pelatihan Aparatur',
      judulPelatihan: 'Pelatihan Tata Naskah Dinas Elektronik & TTE BSrE',
      jenisKegiatan: 'Diklat Teknis',
      jumlahPeserta: 45,
      catatanPemohon: 'Menunggu penyesuaian daftar peserta dari unit pengusul.',
      statusApproval: 'PERLU_REVISI',
      currentApprovalLevel: 1,
      waktuPengajuan: addHours(now, -20),
      slaVerifikasiDeadline: addHours(now, 4),
      slaDeadline: addHours(now, 28),
      isEscalated: false,
    },
  ];

  const reservations: JadwalReservasi[] = [
    {
      id: 'res-1',
      permohonanId: 'perm-1',
      ruanganId: 'room-1', // Auditorium Utama
      pemateriId: 'inst-1', // Dr. Hendra Wijaya
      waktuMulai: atDayAndHour(now, 0, 9, 0),
      waktuSelesai: atDayAndHour(now, 0, 12, 0),
      statusSlot: 'CONFIRMED',
    },
    {
      id: 'res-2',
      permohonanId: 'perm-2',
      ruanganId: 'room-2', // Lab Komputer SPBE A
      pemateriId: 'inst-2', // Ir. Ratna Kusuma
      waktuMulai: atDayAndHour(now, 0, 13, 0),
      waktuSelesai: atDayAndHour(now, 0, 16, 30),
      statusSlot: 'LOCKED_PENDING',
    },
    {
      id: 'res-3',
      permohonanId: 'perm-3',
      ruanganId: 'room-4', // Ruang Kelas Diklat 201
      pemateriId: 'inst-4', // Siti Aminah
      waktuMulai: atDayAndHour(now, 1, 9, 0),
      waktuSelesai: atDayAndHour(now, 1, 12, 0),
      statusSlot: 'LOCKED_PENDING',
    },
    {
      id: 'res-4',
      permohonanId: 'perm-4',
      ruanganId: 'room-3', // Ruang Rapat Eksekutif B
      pemateriId: 'inst-3', // Budi Santoso
      waktuMulai: atDayAndHour(now, 1, 13, 30),
      waktuSelesai: atDayAndHour(now, 1, 16, 0),
      statusSlot: 'LOCKED_PENDING',
    },
    {
      id: 'res-5',
      permohonanId: 'perm-5',
      ruanganId: 'room-4', // Ruang Kelas Diklat 201
      pemateriId: 'inst-1', // Dr. Hendra Wijaya
      waktuMulai: atDayAndHour(now, 2, 9, 0),
      waktuSelesai: atDayAndHour(now, 2, 12, 0),
      statusSlot: 'LOCKED_PENDING',
    },
  ];

  const logs: ApprovalLog[] = [
    {
      id: 'log-1',
      permohonanId: 'perm-1',
      userId: 'usr-pemohon',
      actorName: 'Andi Pratama, S.Kom',
      actorRole: 'Pemohon (Unit Kerja)',
      action: 'SUBMIT',
      previousStatus: 'DRAFT',
      newStatus: 'MENUNGGU_VERIFIKASI',
      note: 'Pengajuan tiket baru melalui portal 1 pintu. Lolos validasi GiST.',
      createdAt: addHours(now, -72),
    },
    {
      id: 'log-2',
      permohonanId: 'perm-1',
      userId: 'usr-verifikator',
      actorName: 'Nadia Kusumawati, S.T',
      actorRole: 'Verifikator (Admin/Prakom)',
      action: 'VERIFY_FORWARD',
      previousStatus: 'MENUNGGU_VERIFIKASI',
      newStatus: 'MENUNGGU_APPROVAL_PIMPINAN',
      note: 'Kesiapan audio & ruang auditorium terkonfirmasi. Diteruskan ke Pimpinan.',
      createdAt: addHours(now, -56),
    },
    {
      id: 'log-3',
      permohonanId: 'perm-1',
      userId: 'usr-pimpinan',
      actorName: 'Drs. Bambang Suryadi, M.Si',
      actorRole: 'Pimpinan (Kadis / Eselon II)',
      action: 'APPROVE_TTE',
      previousStatus: 'MENUNGGU_APPROVAL_PIMPINAN',
      newStatus: 'DISETUJUI_TTE',
      note: 'Disetujui dengan Tanda Tangan Elektronik (TTE).',
      createdAt: addHours(now, -36),
    },
    {
      id: 'log-4',
      permohonanId: 'perm-2',
      userId: 'usr-pemohon',
      actorName: 'Andi Pratama, S.Kom',
      actorRole: 'Pemohon (Unit Kerja)',
      action: 'SUBMIT',
      previousStatus: 'DRAFT',
      newStatus: 'MENUNGGU_VERIFIKASI',
      note: 'Pengajuan Workshop Optimasi PostgreSQL.',
      createdAt: addHours(now, -40),
    },
    {
      id: 'log-5',
      permohonanId: 'perm-2',
      userId: 'usr-verifikator',
      actorName: 'Nadia Kusumawati, S.T',
      actorRole: 'Verifikator (Admin/Prakom)',
      action: 'VERIFY_FORWARD',
      previousStatus: 'MENUNGGU_VERIFIKASI',
      newStatus: 'MENUNGGU_APPROVAL_PIMPINAN',
      note: 'Workstation Lab SPBE A siap. Disposisi ke Pimpinan.',
      createdAt: addHours(now, -22),
    },
    {
      id: 'log-6',
      permohonanId: 'perm-3',
      userId: 'usr-admin',
      actorName: 'Rizky Maulana, M.TI',
      actorRole: 'Super Admin Sistem',
      action: 'SUBMIT',
      previousStatus: 'DRAFT',
      newStatus: 'MENUNGGU_VERIFIKASI',
      note: 'Pengajuan Diklat Audit Sistem Informasi.',
      createdAt: addHours(now, -53),
    },
    {
      id: 'log-7',
      permohonanId: 'perm-3',
      userId: null,
      actorName: 'SLA Escalation Worker',
      actorRole: 'Otomasi Sistem',
      action: 'AUTO_ESCALATE',
      previousStatus: 'MENUNGGU_VERIFIKASI',
      newStatus: 'MENUNGGU_VERIFIKASI',
      note: 'Batas SLA 2x24 jam terlampaui. Notifikasi eskalasi dikirim ke Verifikator & Pimpinan.',
      createdAt: addHours(now, -5),
    },
    {
      id: 'log-8',
      permohonanId: 'perm-5',
      userId: 'usr-verifikator',
      actorName: 'Nadia Kusumawati, S.T',
      actorRole: 'Verifikator (Admin/Prakom)',
      action: 'REQUEST_REVISION',
      previousStatus: 'MENUNGGU_VERIFIKASI',
      newStatus: 'PERLU_REVISI',
      note: 'Mohon unggah daftar nama 45 peserta definitif sebelum disposisi.',
      createdAt: addHours(now, -12),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      permohonanId: 'perm-3',
      nomorTiket: 'SP-2026-0103',
      channel: 'WHATSAPP',
      recipientContact: '+6281234567002',
      title: 'ESKALASI SLA: SP-2026-0103 Melewati Batas 48 Jam',
      messageBody: 'Diklat Audit Sistem Informasi menunggu verifikasi dan telah melewati target SLA.',
      createdAt: addHours(now, -5),
    },
    {
      id: 'notif-2',
      permohonanId: 'perm-2',
      nomorTiket: 'SP-2026-0102',
      channel: 'WHATSAPP',
      recipientContact: '+6281234567003',
      title: 'Peringatan SLA (83%): SP-2026-0102 Menunggu TTE Pimpinan',
      messageBody: 'Workshop Optimasi PostgreSQL tersisa 8 jam sebelum batas SLA berakhir.',
      createdAt: addHours(now, -2),
    },
    {
      id: 'notif-3',
      permohonanId: 'perm-1',
      nomorTiket: 'SP-2026-0101',
      channel: 'EMAIL',
      recipientContact: 'andi.pratama@instansi.go.id',
      title: 'Disetujui (TTE): SP-2026-0101 Terkunci di Smart Calendar',
      messageBody: 'Permohonan Bimtek Arsitektur SPBE telah ditandatangani secara elektronik.',
      createdAt: addHours(now, -36),
    },
  ];

  return { permohonan, reservations, logs, notifications };
}
