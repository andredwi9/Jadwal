import { ArrowRight, Bell, Building2, Clock, Users } from 'lucide-react';
import { getDurationHours, getInstructorWeeklyHours } from '../domain/scheduling';
import { evaluateSlaStatus, formatRemainingSla } from '../domain/sla';
import type {
  FasilitasRuangan,
  JadwalReservasi,
  NotificationItem,
  Pemateri,
  Permohonan,
} from '../types/simpel';
import { ApprovalStatusLabel, SlaHealthLabel } from './StatusLabel';

interface DashboardViewProps {
  permohonanList: Permohonan[];
  reservations: JadwalReservasi[];
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  notifications: NotificationItem[];
  onInspectPermohonan: (permohonanId: string) => void;
  onNavigate: (tab: 'calendar' | 'approvals' | 'schema') => void;
}

export function DashboardView({
  permohonanList,
  reservations,
  rooms,
  instructors,
  notifications,
  onInspectPermohonan,
  onNavigate,
}: DashboardViewProps) {
  const now = new Date();

  const activePending = permohonanList.filter((p) =>
    ['MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL_PIMPINAN', 'PERLU_REVISI'].includes(p.statusApproval)
  );
  const slaEvaluations = activePending.map((p) => ({
    permohonan: p,
    sla: evaluateSlaStatus(p, now),
  }));

  const escalatedOrOverdueCount = slaEvaluations.filter(
    (item) => item.sla.health === 'TERLEWAT' || item.permohonan.isEscalated
  ).length;
  const warningCount = slaEvaluations.filter((item) => item.sla.health === 'WARNING').length;

  const activeReservations = reservations.filter((r) => r.statusSlot !== 'RELEASED');
  const activeRoomsCount = rooms.filter((r) => r.isActive).length;
  const totalScheduledHours = activeReservations.reduce(
    (acc, res) => acc + getDurationHours(res.waktuMulai, res.waktuSelesai),
    0
  );
  // Baseline capacity: active rooms * 8 hours/day * 5 days
  const weeklyCapacityHours = Math.max(1, activeRoomsCount * 40);
  const utilizationPercent = Math.min(100, Math.round((totalScheduledHours / weeklyCapacityHours) * 100));

  const approvedCount = permohonanList.filter((p) => p.statusApproval === 'DISETUJUI_TTE').length;
  const totalDecided = permohonanList.filter((p) =>
    ['DISETUJUI_TTE', 'DITOLAK'].includes(p.statusApproval)
  ).length;
  const slaComplianceRate =
    permohonanList.length > 0
      ? Math.round(
          ((permohonanList.length - escalatedOrOverdueCount) / permohonanList.length) * 100
        )
      : 100;

  // Sort pending queue by urgency (TERLEWAT -> WARNING -> AMAN)
  const urgencyOrder = { TERLEWAT: 0, WARNING: 1, AMAN: 2, SELESAI: 3 };
  const sortedPending = [...slaEvaluations].sort(
    (a, b) => urgencyOrder[a.sla.health] - urgencyOrder[b.sla.health]
  );

  const nowIso = now.toISOString();

  return (
    <div className="space-y-6">
      {/* 4-Column Executive KPI Strip */}
      <section aria-label="Ringkasan KPI Eksekutif" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Permohonan Pending (SLA)</span>
            <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {activePending.length}
            </span>
            <span className="text-xs text-slate-600">Menunggu proses</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
            <span className={escalatedOrOverdueCount > 0 ? 'font-semibold text-red-700' : 'text-slate-600'}>
              {escalatedOrOverdueCount} terlewat
            </span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            <span className={warningCount > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}>
              {warningCount} mendekati batas
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Utilisasi Fasilitas Mingguan</span>
            <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {utilizationPercent}%
            </span>
            <span className="text-xs text-slate-600">Terpakai</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
            {totalScheduledHours.toFixed(1)} jam terjadwal dari {activeRoomsCount} ruangan aktif
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pelatihan Terjadwal (1 Pintu)</span>
            <Users className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {activeReservations.length}
            </span>
            <span className="text-xs text-slate-600">Agenda aktif</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
            {approvedCount} disetujui TTE
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            {totalDecided} selesai diputuskan
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Kepatuhan SLA 2x24 Jam</span>
            <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {slaComplianceRate}%
            </span>
            <span className="text-xs text-slate-600">Tepat waktu</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 tabular-nums">
            Target institusi &gt;90% bebas eskalasi
          </p>
        </div>
      </section>

      {/* Main Two-Zone Analytical Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left 8 cols: SLA Tracking & Escalation Queue */}
        <section
          aria-label="Monitoring Antrean SLA"
          className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pemantauan SLA Persetujuan Berjenjang
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Argo SLA 2x24 jam · Hijau (&lt;75%) · Kuning (75–100%) · Merah (Eskalasi Otomatis)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Semua Antrean
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Tiket & Kegiatan</th>
                  <th className="py-2.5 px-4">Tahap Approval</th>
                  <th className="py-2.5 px-4">Status SLA</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {sortedPending.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-4 text-center text-sm text-slate-500">
                      Seluruh permohonan telah selesai diproses. Tidak ada antrean SLA aktif.
                    </td>
                  </tr>
                ) : (
                  sortedPending.map(({ permohonan, sla }) => (
                    <tr key={permohonan.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 align-top">
                        <div className="font-mono text-xs font-semibold text-blue-900 tabular-nums">
                          {permohonan.nomorTiket}
                        </div>
                        <div className="font-medium text-slate-900 mt-0.5 line-clamp-1">
                          {permohonan.judulPelatihan}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {permohonan.unitKerjaNama} · {permohonan.jumlahPeserta} peserta
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <ApprovalStatusLabel status={permohonan.statusApproval} />
                        <div className="text-xs text-slate-500 mt-1 tabular-nums">
                          Level {permohonan.currentApprovalLevel} / 3
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <SlaHealthLabel
                          health={sla.health}
                          detailText={formatRemainingSla(sla.remainingHours)}
                        />
                        <div className="mt-1.5 w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              sla.health === 'TERLEWAT'
                                ? 'bg-red-600'
                                : sla.health === 'WARNING'
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.min(100, sla.elapsedPercent)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => onInspectPermohonan(permohonan.id)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                          aria-label={`Tinjau permohonan ${permohonan.nomorTiket}`}
                        >
                          Tinjau
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right 4 cols: Instructor Workload & Omnichannel Log */}
        <div className="xl:col-span-4 space-y-6">
          <section
            aria-label="Beban Mengajar Pemateri"
            className="bg-white border border-slate-200 rounded-lg p-5"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Pemerataan Beban Mengajar Pemateri
              </h2>
              <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">Minggu ini</span>
            </div>
            <div className="mt-4 space-y-3.5">
              {instructors.map((inst) => {
                const hours = getInstructorWeeklyHours(inst.id, nowIso, reservations);
                const pct = Math.min(100, Math.round((hours / inst.maxJamMengajarMingguan) * 100));
                return (
                  <div key={inst.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 truncate pr-2">
                        {inst.namaPemateri}
                      </span>
                      <span className="font-mono text-slate-600 tabular-nums shrink-0">
                        {hours.toFixed(1)} / {inst.maxJamMengajarMingguan} jam
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          pct >= 85 ? 'bg-amber-600' : 'bg-blue-900'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Log Notifikasi Omnichannel"
            className="bg-white border border-slate-200 rounded-lg p-5"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Notifikasi Omnichannel (WA / Email)
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {notifications.length} terkirim
              </span>
            </div>
            <ul className="mt-3 divide-y divide-slate-200">
              {notifications.slice(0, 4).map((notif) => (
                <li key={notif.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">
                      {notif.channel} · {notif.nomorTiket}
                    </span>
                    <span className="tabular-nums">
                      {new Date(notif.createdAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-900 mt-1">{notif.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.messageBody}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
