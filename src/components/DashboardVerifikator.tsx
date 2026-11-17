import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FilePlus2,
  LayoutDashboard,
  Menu,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export type SlaUrgency = 'overdue' | 'approaching' | 'safe';

export interface PendingPermohonanRow {
  id: string;
  nomorTiket: string;
  namaPemohon: string;
  unitKerja: string;
  judulPelatihan: string;
  ruangan: string;
  tanggal: string; // e.g. "18 Nov 2026 · 09:00–12:00"
  slaDeadlineLabel: string; // e.g. "Lewat 4.5 jam", "Sisa 5.2 jam", "Sisa 34.0 jam"
  slaUrgency: SlaUrgency;
  statusApproval: 'MENUNGGU_VERIFIKASI' | 'MENUNGGU_APPROVAL_PIMPINAN' | 'DISETUJUI_TTE';
}

type VerifikatorNavKey = 'dashboard' | 'booking' | 'kalender' | 'master';

const INITIAL_MOCK_PENDING: PendingPermohonanRow[] = [
  {
    id: 'perm-3',
    nomorTiket: 'SP-2026-0103',
    namaPemohon: 'Rizky Maulana, M.TI',
    unitKerja: 'Inspektorat Jenderal Pengawasan',
    judulPelatihan: 'Diklat Audit Sistem Informasi Berbasis Risiko & SPBE',
    ruangan: 'Ruang Kelas Diklat 201',
    tanggal: '18 Nov 2026 · 09:00–12:00',
    slaDeadlineLabel: 'Lewat 5.0 jam',
    slaUrgency: 'overdue',
    statusApproval: 'MENUNGGU_VERIFIKASI',
  },
  {
    id: 'perm-2',
    nomorTiket: 'SP-2026-0102',
    namaPemohon: 'Andi Pratama, S.Kom',
    unitKerja: 'Pusat Data dan Informasi (SPBE)',
    judulPelatihan: 'Workshop Optimasi PostgreSQL & GiST Indexing untuk Layanan Publik',
    ruangan: 'Lab Komputer SPBE A',
    tanggal: '17 Nov 2026 · 13:00–16:30',
    slaDeadlineLabel: 'Sisa 8.0 jam',
    slaUrgency: 'approaching',
    statusApproval: 'MENUNGGU_VERIFIKASI',
  },
  {
    id: 'perm-4',
    nomorTiket: 'SP-2026-0104',
    namaPemohon: 'Andi Pratama, S.Kom',
    unitKerja: 'Biro Sumber Daya Manusia & Organisasi',
    judulPelatihan: 'Sosialisasi Reformasi Birokrasi Tematik & Kinerja ASN',
    ruangan: 'Ruang Rapat Eksekutif B',
    tanggal: '18 Nov 2026 · 13:30–16:00',
    slaDeadlineLabel: 'Sisa 38.0 jam',
    slaUrgency: 'safe',
    statusApproval: 'MENUNGGU_VERIFIKASI',
  },
  {
    id: 'perm-6',
    nomorTiket: 'SP-2026-0106',
    namaPemohon: 'Dewi Anggraini, S.E',
    unitKerja: 'Balai Pendidikan & Pelatihan Aparatur',
    judulPelatihan: 'Bimtek Pengadaan Barang & Jasa Elektronik Pemerintah',
    ruangan: 'Ruang Auditorium Utama',
    tanggal: '19 Nov 2026 · 08:30–15:30',
    slaDeadlineLabel: 'Sisa 42.5 jam',
    slaUrgency: 'safe',
    statusApproval: 'MENUNGGU_VERIFIKASI',
  },
];

const SIDEBAR_NAV: { key: VerifikatorNavKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'booking', label: 'Booking', icon: FilePlus2 },
  { key: 'kalender', label: 'Kalender', icon: CalendarDays },
  { key: 'master', label: 'Master Data', icon: Building2 },
];

export interface DashboardVerifikatorProps {
  /** When true, hides the component's own sidebar so it can sit inside an outer app shell without double sidebars. */
  embedded?: boolean;
  /** Optional external rows supplied by parent workspace; falls back to self-contained mock queue. */
  rows?: PendingPermohonanRow[];
  /** Optional callback triggered when the user clicks Approve. Return true/void on success. */
  onApproveItem?: (row: PendingPermohonanRow) => Promise<boolean | void> | boolean | void;
  /** Optional navigation callbacks for standalone or integrated routing. */
  onNavigate?: (key: VerifikatorNavKey) => void;
}

export function DashboardVerifikator({
  embedded = false,
  rows,
  onApproveItem,
  onNavigate,
}: DashboardVerifikatorProps) {
  const [localRows, setLocalRows] = useState<PendingPermohonanRow[]>(INITIAL_MOCK_PENDING);
  const [activeNav, setActiveNav] = useState<VerifikatorNavKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | SlaUrgency>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [apiFeedback, setApiFeedback] = useState<string | null>(null);

  const sourceRows = rows ?? localRows;

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const urgencyRank: Record<SlaUrgency, number> = { overdue: 0, approaching: 1, safe: 2 };

    return [...sourceRows]
      .filter((item) => {
        if (urgencyFilter !== 'all' && item.slaUrgency !== urgencyFilter) return false;
        if (!q) return true;
        return (
          item.namaPemohon.toLowerCase().includes(q) ||
          item.judulPelatihan.toLowerCase().includes(q) ||
          item.ruangan.toLowerCase().includes(q) ||
          item.nomorTiket.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => urgencyRank[a.slaUrgency] - urgencyRank[b.slaUrgency]);
  }, [sourceRows, searchQuery, urgencyFilter]);

  const overdueCount = sourceRows.filter((r) => r.slaUrgency === 'overdue').length;
  const approachingCount = sourceRows.filter((r) => r.slaUrgency === 'approaching').length;
  const safeCount = sourceRows.filter((r) => r.slaUrgency === 'safe').length;

  async function handleMockApprove(row: PendingPermohonanRow) {
    setProcessingId(row.id);
    setApiFeedback(null);

    try {
      if (onApproveItem) {
        await onApproveItem(row);
      } else {
        // Simulate PUT /permohonan/{id}/approve API latency
        await new Promise((resolve) => setTimeout(resolve, 350));
        setLocalRows((prev) => prev.filter((item) => item.id !== row.id));
      }
      setApiFeedback(
        `PUT /permohonan/${row.id}/approve (200 OK): ${row.nomorTiket} disetujui & diteruskan.`
      );
    } finally {
      setProcessingId(null);
    }
  }

  function handleNavClick(key: VerifikatorNavKey) {
    setActiveNav(key);
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate(key);
    }
  }

  function renderSlaBadge(urgency: SlaUrgency, label: string) {
    if (urgency === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200 tabular-nums whitespace-nowrap">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Terlewat · {label}</span>
        </span>
      );
    }
    if (urgency === 'approaching') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-300 tabular-nums whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Mendekati · {label}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 border border-green-200 tabular-nums whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Aman · {label}</span>
      </span>
    );
  }

  const mainContent = (
    <div className="space-y-5">
      {/* Summary Strip */}
      <section aria-label="Ringkasan SLA Verifikator" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>SLA Terlewat (Merah)</span>
            <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 tabular-nums">{overdueCount}</div>
          <p className="text-xs text-slate-500 mt-0.5">Perlu eskalasi & tindakan segera</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Mendekati Batas (Kuning)</span>
            <Clock className="w-4 h-4 text-yellow-700" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-yellow-800 tabular-nums">{approachingCount}</div>
          <p className="text-xs text-slate-500 mt-0.5">Waktu SLA terpakai &ge; 75%</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Dalam Batas Aman (Hijau)</span>
            <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-green-700 tabular-nums">{safeCount}</div>
          <p className="text-xs text-slate-500 mt-0.5">Antrean normal target 2x24 jam</p>
        </div>
      </section>

      {/* Non-blocking API trigger banner */}
      {apiFeedback && (
        <div
          role="status"
          className="px-4 py-3 bg-blue-950 text-white text-xs font-medium rounded-lg flex items-center justify-between gap-4"
        >
          <span>{apiFeedback}</span>
          <button
            type="button"
            onClick={() => setApiFeedback(null)}
            className="text-blue-200 hover:text-white cursor-pointer"
            aria-label="Tutup pesan status"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Permohonan Table Card */}
      <section
        aria-label="Daftar Pending Permohonan"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pending Permohonan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Diurutkan otomatis berdasarkan tenggat SLA terdekat ({filteredRows.length} antrean)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Filter urgensi SLA"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'overdue', label: 'Terlewat' },
                  { id: 'approaching', label: 'Mendekati' },
                  { id: 'safe', label: 'Aman' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={urgencyFilter === tab.id}
                  onClick={() => setUrgencyFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    urgencyFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="verifikator-search" className="sr-only">
                Cari pemohon, pelatihan, atau ruangan
              </label>
              <input
                id="verifikator-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari pemohon atau ruangan..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Nama Pemohon</th>
                <th className="py-3 px-4">Judul Pelatihan</th>
                <th className="py-3 px-4">Ruangan</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">SLA Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Tidak ada permohonan pending yang sesuai filter.
                    </p>
                    {(searchQuery || urgencyFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setUrgencyFilter('all');
                        }}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-900 border border-blue-900/30 rounded-md hover:bg-blue-50 cursor-pointer"
                      >
                        Reset Pencarian
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isBusy = processingId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-900">{row.namaPemohon}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{row.unitKerja}</div>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono text-[11px] font-semibold text-blue-900 tabular-nums">
                          {row.nomorTiket}
                        </div>
                        <div className="font-medium text-slate-900 mt-0.5 max-w-xs">
                          {row.judulPelatihan}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top text-xs font-medium text-slate-800 whitespace-nowrap">
                        {row.ruangan}
                      </td>
                      <td className="py-3.5 px-4 align-top font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {row.tanggal}
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        {renderSlaBadge(row.slaUrgency, row.slaDeadlineLabel)}
                      </td>
                      <td className="py-3.5 px-4 align-top text-right">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleMockApprove(row)}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:bg-slate-400 rounded-md whitespace-nowrap cursor-pointer"
                          aria-label={`Approve permohonan ${row.nomorTiket} oleh ${row.namaPemohon}`}
                        >
                          {isBusy ? 'Memproses...' : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  if (embedded) {
    return mainContent;
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar */}
      <aside
        aria-label="Navigasi Dashboard Verifikator"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="font-bold tracking-tight text-white text-base whitespace-nowrap">
              SIMPEL PINTU
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Tutup menu samping"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {SIDEBAR_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-900 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs">
          <div className="font-semibold text-white">Nadia Kusumawati, S.T</div>
          <div className="text-slate-400 mt-0.5">Verifikator (Admin / Prakom)</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">SIMPEL PINTU / Verifikator</div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                Dashboard Verifikator
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleNavClick('booking')}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ajukan Booking
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {mainContent}
        </main>
      </div>
    </div>
  );
}

export default DashboardVerifikator;
