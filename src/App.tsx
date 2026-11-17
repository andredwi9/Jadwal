import {
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  Menu,
  Plus,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApprovalQueueView } from './components/ApprovalQueueView';
import { BookingModal, type NewBookingPayload } from './components/BookingModal';
import {
  DashboardVerifikator,
  type PendingPermohonanRow,
  type SlaUrgency,
} from './components/DashboardVerifikator';
import { DashboardView } from './components/DashboardView';
import { MasterDataView } from './components/MasterDataView';
import { SchemaExplorerView } from './components/SchemaExplorerView';
import { SmartCalendarView } from './components/SmartCalendarView';
import {
  createInitialSeedState,
  INITIAL_INSTRUCTORS,
  INITIAL_ROOMS,
  INITIAL_USERS,
} from './data/seedData';
import { transitionPermohonanStatus } from './domain/approval';
import { detectScheduleConflicts } from './domain/scheduling';
import { evaluateSlaStatus, formatRemainingSla } from './domain/sla';
import type {
  AppUser,
  ApprovalAction,
  ApprovalLog,
  FasilitasRuangan,
  JadwalReservasi,
  NotificationItem,
  Pemateri,
  Permohonan,
} from './types/simpel';

type NavTab = 'dashboard' | 'verifikator' | 'calendar' | 'approvals' | 'master' | 'schema';

const STORAGE_KEY = 'simpel_pintu_workspace_v1';

interface PersistedWorkspace {
  permohonan: Permohonan[];
  reservations: JadwalReservasi[];
  logs: ApprovalLog[];
  notifications: NotificationItem[];
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  activeUserId: string;
}

function loadWorkspace(): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedWorkspace;
      if (Array.isArray(parsed.permohonan) && Array.isArray(parsed.reservations)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to initial seed
  }
  const seed = createInitialSeedState(new Date());
  return {
    permohonan: seed.permohonan,
    reservations: seed.reservations,
    logs: seed.logs,
    notifications: seed.notifications,
    rooms: INITIAL_ROOMS,
    instructors: INITIAL_INSTRUCTORS,
    activeUserId: INITIAL_USERS[0].id,
  };
}

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard Eksekutif', icon: LayoutDashboard },
  { id: 'verifikator', label: 'Dashboard Verifikator', icon: ClipboardCheck },
  { id: 'calendar', label: 'Smart Calendar', icon: CalendarDays },
  { id: 'approvals', label: 'Antrean E-Approval', icon: CheckSquare },
  { id: 'master', label: 'Master Ruangan & SDM', icon: Building2 },
  { id: 'schema', label: 'Skema PostgreSQL', icon: Database },
];

function formatTanggalJadwal(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return 'Jadwal belum ditentukan';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const endTime = end.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart} · ${startTime}–${endTime}`;
}

export default function App() {
  const [standaloneVerifikator, setStandaloneVerifikator] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.location.search.includes('verifikator=1')
  );
  const [workspace, setWorkspace] = useState<PersistedWorkspace>(() => loadWorkspace());
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedPermohonanId, setSelectedPermohonanId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{
    ruanganId?: string;
    dateStr?: string;
    startHour?: number;
  } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // Ignore storage quota errors
    }
  }, [workspace]);

  const currentUser: AppUser =
    INITIAL_USERS.find((u) => u.id === workspace.activeUserId) ?? INITIAL_USERS[0];

  const pendingApprovalsCount = workspace.permohonan.filter((p) =>
    ['MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL_PIMPINAN'].includes(p.statusApproval)
  ).length;

  const verifikatorPendingRows = useMemo<PendingPermohonanRow[]>(() => {
    const now = new Date();
    return workspace.permohonan
      .filter(
        (p) =>
          p.statusApproval === 'MENUNGGU_VERIFIKASI' ||
          p.statusApproval === 'MENUNGGU_APPROVAL_PIMPINAN'
      )
      .map((p) => {
        const res = workspace.reservations.find((r) => r.permohonanId === p.id);
        const room = res ? workspace.rooms.find((rm) => rm.id === res.ruanganId) : undefined;
        const sla = evaluateSlaStatus(p, now);
        const slaUrgency: SlaUrgency =
          sla.health === 'TERLEWAT'
            ? 'overdue'
            : sla.health === 'WARNING'
              ? 'approaching'
              : 'safe';

        return {
          id: p.id,
          nomorTiket: p.nomorTiket,
          namaPemohon: p.pemohonNama,
          unitKerja: p.unitKerjaNama,
          judulPelatihan: p.judulPelatihan,
          ruangan: room?.namaRuangan ?? 'Belum dialokasikan',
          tanggal: formatTanggalJadwal(res?.waktuMulai, res?.waktuSelesai),
          slaDeadlineLabel: formatRemainingSla(sla.remainingHours),
          slaUrgency,
          statusApproval:
            p.statusApproval === 'MENUNGGU_APPROVAL_PIMPINAN'
              ? 'MENUNGGU_APPROVAL_PIMPINAN'
              : 'MENUNGGU_VERIFIKASI',
        };
      });
  }, [workspace.permohonan, workspace.reservations, workspace.rooms]);

  function showToast(msg: string) {
    setBannerMessage(msg);
    setTimeout(() => {
      setBannerMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  function handleInspectPermohonan(permohonanId: string) {
    setSelectedPermohonanId(permohonanId);
    setActiveTab('approvals');
  }

  function handleQuickBookSlot(ruanganId: string, dateStr: string, startHour: number) {
    setBookingPrefill({ ruanganId, dateStr, startHour });
    setBookingModalOpen(true);
  }

  function handleSubmitBooking(payload: NewBookingPayload) {
    // Double-check atomic conflict guard before mutating state
    const check = detectScheduleConflicts(
      {
        ruanganId: payload.ruanganId,
        pemateriId: payload.pemateriId,
        waktuMulai: payload.waktuMulai,
        waktuSelesai: payload.waktuSelesai,
        jumlahPeserta: payload.jumlahPeserta,
      },
      workspace.reservations,
      workspace.rooms,
      workspace.instructors,
      workspace.permohonan
    );
    if (check.hasConflict) {
      showToast('Pengajuan ditolak: bentrok jadwal terdeteksi.');
      return;
    }

    const now = new Date();
    const nextNum = 101 + workspace.permohonan.length;
    const nomorTiket = `SP-2026-0${nextNum}`;
    const newPermohonanId = `perm-${Date.now()}`;

    const newPermohonan: Permohonan = {
      id: newPermohonanId,
      nomorTiket,
      userId: currentUser.id,
      pemohonNama: currentUser.nama,
      unitKerjaId: currentUser.unitKerjaId,
      unitKerjaNama: currentUser.unitKerjaNama,
      judulPelatihan: payload.judulPelatihan,
      jenisKegiatan: payload.jenisKegiatan,
      jumlahPeserta: payload.jumlahPeserta,
      catatanPemohon: payload.catatanPemohon,
      statusApproval: 'MENUNGGU_VERIFIKASI',
      currentApprovalLevel: 1,
      waktuPengajuan: now.toISOString(),
      slaVerifikasiDeadline: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      slaDeadline: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
      isEscalated: false,
    };

    const newReservation: JadwalReservasi = {
      id: `res-${Date.now()}`,
      permohonanId: newPermohonanId,
      ruanganId: payload.ruanganId,
      pemateriId: payload.pemateriId,
      waktuMulai: payload.waktuMulai,
      waktuSelesai: payload.waktuSelesai,
      statusSlot: 'LOCKED_PENDING',
    };

    const newLog: ApprovalLog = {
      id: `log-${Date.now()}`,
      permohonanId: newPermohonanId,
      userId: currentUser.id,
      actorName: currentUser.nama,
      actorRole: currentUser.roleLabel,
      action: 'SUBMIT',
      previousStatus: 'DRAFT',
      newStatus: 'MENUNGGU_VERIFIKASI',
      note: 'Tiket diajukan melalui portal 1 pintu. Slot ruangan & pemateri dikunci (LOCKED_PENDING).',
      createdAt: now.toISOString(),
    };

    const newNotification: NotificationItem = {
      id: `notif-${Date.now()}`,
      permohonanId: newPermohonanId,
      nomorTiket,
      channel: 'WHATSAPP',
      recipientContact: '+6281234567002',
      title: `Tiket Baru ${nomorTiket}: Menunggu Verifikasi`,
      messageBody: `${payload.judulPelatihan} (${payload.jumlahPeserta} peserta) diajukan oleh ${currentUser.unitKerjaNama}.`,
      createdAt: now.toISOString(),
    };

    setWorkspace((prev) => ({
      ...prev,
      permohonan: [newPermohonan, ...prev.permohonan],
      reservations: [...prev.reservations, newReservation],
      logs: [...prev.logs, newLog],
      notifications: [newNotification, ...prev.notifications],
    }));

    setSelectedPermohonanId(newPermohonanId);
    showToast(`Tiket ${nomorTiket} berhasil diajukan. Argo SLA 2x24 jam dimulai.`);
  }

  function handleExecuteAction(permohonanId: string, action: ApprovalAction, note: string) {
    const target = workspace.permohonan.find((p) => p.id === permohonanId);
    if (!target) return { ok: false, error: 'Permohonan tidak ditemukan.' };

    const result = transitionPermohonanStatus(
      target,
      workspace.reservations,
      action,
      currentUser,
      note,
      new Date()
    );

    if (!result.ok || !result.updatedPermohonan || !result.updatedReservations) {
      return { ok: false, error: result.error };
    }

    setWorkspace((prev) => ({
      ...prev,
      permohonan: prev.permohonan.map((p) =>
        p.id === permohonanId ? result.updatedPermohonan! : p
      ),
      reservations: result.updatedReservations!,
      logs: result.newLog ? [...prev.logs, result.newLog] : prev.logs,
      notifications: result.newNotification
        ? [result.newNotification, ...prev.notifications]
        : prev.notifications,
    }));

    showToast(`Status ${target.nomorTiket} diperbarui (${result.updatedPermohonan.statusApproval}).`);
    return { ok: true };
  }

  function handleAddRoom(room: Omit<FasilitasRuangan, 'id'>) {
    setWorkspace((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { ...room, id: `room-${Date.now()}` }],
    }));
    showToast(`Ruangan ${room.namaRuangan} ditambahkan ke master data.`);
  }

  function handleToggleRoomActive(roomId: string) {
    setWorkspace((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, isActive: !r.isActive } : r)),
    }));
  }

  function handleAddInstructor(inst: Omit<Pemateri, 'id'>) {
    setWorkspace((prev) => ({
      ...prev,
      instructors: [...prev.instructors, { ...inst, id: `inst-${Date.now()}` }],
    }));
    showToast(`Pemateri ${inst.namaPemateri} ditambahkan ke master data.`);
  }

  function handleToggleInstructorActive(instructorId: string) {
    setWorkspace((prev) => ({
      ...prev,
      instructors: prev.instructors.map((i) =>
        i.id === instructorId ? { ...i, isActive: !i.isActive } : i
      ),
    }));
  }

  function handleResetDemo() {
    const fresh = createInitialSeedState(new Date());
    setWorkspace({
      permohonan: fresh.permohonan,
      reservations: fresh.reservations,
      logs: fresh.logs,
      notifications: fresh.notifications,
      rooms: INITIAL_ROOMS,
      instructors: INITIAL_INSTRUCTORS,
      activeUserId: currentUser.id,
    });
    setSelectedPermohonanId(null);
    showToast('Data simulasi dikembalikan ke kondisi awal.');
  }

  async function handleVerifikatorApprove(row: PendingPermohonanRow): Promise<boolean> {
    const target = workspace.permohonan.find((p) => p.id === row.id);
    if (!target) return false;

    const action: ApprovalAction =
      target.statusApproval === 'MENUNGGU_VERIFIKASI' ? 'VERIFY_FORWARD' : 'APPROVE_TTE';

    const actor: AppUser =
      action === 'VERIFY_FORWARD'
        ? currentUser.role === 'VERIFIKATOR' || currentUser.role === 'SUPER_ADMIN'
          ? currentUser
          : INITIAL_USERS.find((u) => u.role === 'VERIFIKATOR') ?? currentUser
        : currentUser.role === 'PIMPINAN' || currentUser.role === 'SUPER_ADMIN'
          ? currentUser
          : INITIAL_USERS.find((u) => u.role === 'PIMPINAN') ?? currentUser;

    const result = transitionPermohonanStatus(
      target,
      workspace.reservations,
      action,
      actor,
      action === 'VERIFY_FORWARD'
        ? 'Disetujui pada Dashboard Verifikator dan diteruskan ke Pimpinan.'
        : 'Disetujui & ditandatangani elektronik (TTE) melalui antrean verifikasi.',
      new Date()
    );

    if (!result.ok || !result.updatedPermohonan || !result.updatedReservations) {
      showToast(result.error ?? 'Gagal menyetujui permohonan.');
      return false;
    }

    setWorkspace((prev) => ({
      ...prev,
      permohonan: prev.permohonan.map((p) =>
        p.id === row.id ? result.updatedPermohonan! : p
      ),
      reservations: result.updatedReservations!,
      logs: result.newLog ? [...prev.logs, result.newLog] : prev.logs,
      notifications: result.newNotification
        ? [result.newNotification, ...prev.notifications]
        : prev.notifications,
    }));

    return true;
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab)!;

  if (standaloneVerifikator) {
    return (
      <>
        <DashboardVerifikator
          onNavigate={(key) => {
            if (key === 'booking') {
              setBookingPrefill(null);
              setBookingModalOpen(true);
            } else if (key === 'kalender') {
              setStandaloneVerifikator(false);
              setActiveTab('calendar');
            } else if (key === 'master') {
              setStandaloneVerifikator(false);
              setActiveTab('master');
            }
          }}
        />
        <BookingModal
          isOpen={bookingModalOpen}
          currentUser={currentUser}
          rooms={workspace.rooms}
          instructors={workspace.instructors}
          reservations={workspace.reservations}
          permohonanList={workspace.permohonan}
          prefill={bookingPrefill}
          onClose={() => setBookingModalOpen(false)}
          onSubmitBooking={handleSubmitBooking}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar Navigation (256px) */}
      <aside
        aria-label="Navigasi Utama SIMPEL PINTU"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="font-bold tracking-tight text-white text-base whitespace-nowrap">
              SIMPEL PINTU
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Tutup menu navigasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-900 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'approvals' && pendingApprovalsCount > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-blue-200">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* RBAC Role Switcher & User Context */}
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/40">
          <div>
            <label htmlFor="rbac-role-select" className="block text-[11px] font-medium text-slate-400 mb-1">
              Simulasi Peran (RBAC)
            </label>
            <select
              id="rbac-role-select"
              value={workspace.activeUserId}
              onChange={(e) =>
                setWorkspace((prev) => ({ ...prev, activeUserId: e.target.value }))
              }
              className="w-full px-2.5 py-2 text-xs font-medium bg-slate-800 text-white border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {INITIAL_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.roleLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs">
            <div className="font-semibold text-white truncate">{currentUser.nama}</div>
            <div className="font-mono text-[11px] text-slate-400 tabular-nums mt-0.5">
              NIP {currentUser.nip}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              {currentUser.unitKerjaNama}
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetDemo}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset Data Simulasi
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Contextual Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
                <span>SIMPEL PINTU</span>
                <span aria-hidden="true">/</span>
                <span className="font-medium text-slate-800 truncate">{activeNavMeta.label}</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setBookingPrefill(null);
              setBookingModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Ajukan Pelatihan
          </button>
        </header>

        {/* Non-blocking status notification */}
        {bannerMessage && (
          <div
            role="status"
            className="mx-4 sm:mx-6 mt-4 px-4 py-2.5 bg-blue-950 text-white text-xs font-medium rounded-md flex items-center justify-between gap-4"
          >
            <span>{bannerMessage}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-blue-200 hover:text-white cursor-pointer"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              permohonanList={workspace.permohonan}
              reservations={workspace.reservations}
              rooms={workspace.rooms}
              instructors={workspace.instructors}
              notifications={workspace.notifications}
              onInspectPermohonan={handleInspectPermohonan}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'verifikator' && (
            <DashboardVerifikator
              embedded
              rows={verifikatorPendingRows}
              onApproveItem={handleVerifikatorApprove}
              onNavigate={(key) => {
                if (key === 'booking') {
                  setBookingPrefill(null);
                  setBookingModalOpen(true);
                } else if (key === 'kalender') {
                  setActiveTab('calendar');
                } else if (key === 'master') {
                  setActiveTab('master');
                } else {
                  setActiveTab('dashboard');
                }
              }}
            />
          )}

          {activeTab === 'calendar' && (
            <SmartCalendarView
              rooms={workspace.rooms}
              instructors={workspace.instructors}
              reservations={workspace.reservations}
              permohonanList={workspace.permohonan}
              onQuickBookSlot={handleQuickBookSlot}
              onInspectPermohonan={handleInspectPermohonan}
            />
          )}

          {activeTab === 'approvals' && (
            <ApprovalQueueView
              currentUser={currentUser}
              permohonanList={workspace.permohonan}
              reservations={workspace.reservations}
              rooms={workspace.rooms}
              instructors={workspace.instructors}
              logs={workspace.logs}
              selectedPermohonanId={selectedPermohonanId}
              onSelectPermohonan={setSelectedPermohonanId}
              onExecuteAction={handleExecuteAction}
            />
          )}

          {activeTab === 'master' && (
            <MasterDataView
              currentUser={currentUser}
              rooms={workspace.rooms}
              instructors={workspace.instructors}
              reservations={workspace.reservations}
              onAddRoom={handleAddRoom}
              onToggleRoomActive={handleToggleRoomActive}
              onAddInstructor={handleAddInstructor}
              onToggleInstructorActive={handleToggleInstructorActive}
            />
          )}

          {activeTab === 'schema' && <SchemaExplorerView />}
        </main>
      </div>

      <BookingModal
        isOpen={bookingModalOpen}
        currentUser={currentUser}
        rooms={workspace.rooms}
        instructors={workspace.instructors}
        reservations={workspace.reservations}
        permohonanList={workspace.permohonan}
        prefill={bookingPrefill}
        onClose={() => setBookingModalOpen(false)}
        onSubmitBooking={handleSubmitBooking}
      />
    </div>
  );
}
