import { FileSignature, History, Search, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { evaluateSlaStatus, formatRemainingSla } from '../domain/sla';
import type {
  AppUser,
  ApprovalAction,
  ApprovalLog,
  ApprovalStatus,
  FasilitasRuangan,
  JadwalReservasi,
  Pemateri,
  Permohonan,
} from '../types/simpel';
import { ApprovalStatusLabel, SlaHealthLabel, SlotStatusText } from './StatusLabel';

interface ApprovalQueueViewProps {
  currentUser: AppUser;
  permohonanList: Permohonan[];
  reservations: JadwalReservasi[];
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  logs: ApprovalLog[];
  selectedPermohonanId: string | null;
  onSelectPermohonan: (id: string) => void;
  onExecuteAction: (permohonanId: string, action: ApprovalAction, note: string) => { ok: boolean; error?: string };
}

type FilterTab = 'ALL' | 'PENDING' | 'APPROVED' | 'REVISION_OR_REJECTED';

export function ApprovalQueueView({
  currentUser,
  permohonanList,
  reservations,
  rooms,
  instructors,
  logs,
  selectedPermohonanId,
  onSelectPermohonan,
  onExecuteAction,
}: ApprovalQueueViewProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const now = new Date();

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return permohonanList.filter((item) => {
      if (filterTab === 'PENDING') {
        if (!['MENUNGGU_VERIFIKASI', 'MENUNGGU_APPROVAL_PIMPINAN'].includes(item.statusApproval)) {
          return false;
        }
      } else if (filterTab === 'APPROVED') {
        if (item.statusApproval !== 'DISETUJUI_TTE') return false;
      } else if (filterTab === 'REVISION_OR_REJECTED') {
        if (!['PERLU_REVISI', 'DITOLAK', 'DIBATALKAN'].includes(item.statusApproval)) return false;
      }

      if (!q) return true;
      return (
        item.nomorTiket.toLowerCase().includes(q) ||
        item.judulPelatihan.toLowerCase().includes(q) ||
        item.unitKerjaNama.toLowerCase().includes(q) ||
        item.pemohonNama.toLowerCase().includes(q)
      );
    });
  }, [permohonanList, filterTab, searchQuery]);

  const activeDetail =
    permohonanList.find((p) => p.id === selectedPermohonanId) ?? filteredList[0] ?? null;

  const activeReservation = activeDetail
    ? reservations.find((r) => r.permohonanId === activeDetail.id)
    : undefined;
  const activeRoom = activeReservation
    ? rooms.find((rm) => rm.id === activeReservation.ruanganId)
    : undefined;
  const activeInstructor = activeReservation
    ? instructors.find((inst) => inst.id === activeReservation.pemateriId)
    : undefined;

  const activeLogs = activeDetail
    ? logs.filter((l) => l.permohonanId === activeDetail.id)
    : [];

  function handleAction(action: ApprovalAction) {
    if (!activeDetail) return;
    const res = onExecuteAction(activeDetail.id, action, actionNote);
    if (!res.ok) {
      setActionFeedback({ type: 'error', text: res.error ?? 'Gagal memproses persetujuan.' });
    } else {
      setActionNote('');
      setActionFeedback({
        type: 'success',
        text: `Aksi ${action} berhasil dicatat ke audit log untuk ${activeDetail.nomorTiket}.`,
      });
    }
  }

  const canVerify =
    (currentUser.role === 'VERIFIKATOR' || currentUser.role === 'SUPER_ADMIN') &&
    activeDetail?.statusApproval === 'MENUNGGU_VERIFIKASI';
  const canApproveTte =
    (currentUser.role === 'PIMPINAN' || currentUser.role === 'SUPER_ADMIN') &&
    activeDetail?.statusApproval === 'MENUNGGU_APPROVAL_PIMPINAN';
  const canReject =
    (currentUser.role === 'VERIFIKATOR' ||
      currentUser.role === 'PIMPINAN' ||
      currentUser.role === 'SUPER_ADMIN') &&
    (activeDetail?.statusApproval === 'MENUNGGU_VERIFIKASI' ||
      activeDetail?.statusApproval === 'MENUNGGU_APPROVAL_PIMPINAN');
  const canCancel =
    (currentUser.role === 'SUPER_ADMIN' ||
      (currentUser.role === 'PEMOHON' && activeDetail?.userId === currentUser.id)) &&
    activeDetail != null &&
    !['DISETUJUI_TTE', 'DITOLAK', 'DIBATALKAN'].includes(activeDetail.statusApproval);
  const canResubmit =
    (currentUser.role === 'PEMOHON' || currentUser.role === 'SUPER_ADMIN') &&
    activeDetail?.statusApproval === 'PERLU_REVISI';

  const statusOrderHint = (status: ApprovalStatus) => {
    if (status === 'MENUNGGU_VERIFIKASI') return 'Menunggu Verifikasi (Admin/Prakom)';
    if (status === 'MENUNGGU_APPROVAL_PIMPINAN') return 'Menunggu TTE Pimpinan';
    if (status === 'PERLU_REVISI') return 'Menunggu Revisi Pemohon';
    return status;
  };

  return (
    <div className="space-y-4">
      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter status permohonan"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {(
            [
              { id: 'ALL', label: 'Semua' },
              { id: 'PENDING', label: 'Dalam Proses' },
              { id: 'APPROVED', label: 'Disetujui TTE' },
              { id: 'REVISION_OR_REJECTED', label: 'Revisi / Ditolak' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterTab === tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="approval-search" className="sr-only">
            Cari tiket atau judul pelatihan
          </label>
          <input
            id="approval-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor tiket, judul, unit..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
          />
        </div>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Permohonan</th>
                  <th className="py-2.5 px-4">Status Approval</th>
                  <th className="py-2.5 px-4">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-10 px-4 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        Tidak ada permohonan yang cocok dengan filter saat ini.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterTab('ALL');
                          setSearchQuery('');
                        }}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-900 border border-blue-900/30 rounded-md hover:bg-blue-50 cursor-pointer"
                      >
                        Reset Filter
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item) => {
                    const sla = evaluateSlaStatus(item, now);
                    const isSelected = activeDetail?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4 align-top">
                          <button
                            type="button"
                            onClick={() => {
                              setActionFeedback(null);
                              onSelectPermohonan(item.id);
                            }}
                            className="text-left w-full cursor-pointer"
                            aria-label={`Pilih tiket ${item.nomorTiket} ${item.judulPelatihan}`}
                          >
                            <div className="font-mono text-xs font-semibold text-blue-900 tabular-nums">
                              {item.nomorTiket}
                            </div>
                            <div className="font-semibold text-slate-900 mt-0.5">
                              {item.judulPelatihan}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {item.unitKerjaNama} · {item.jumlahPeserta} peserta
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <ApprovalStatusLabel status={item.statusApproval} />
                          <div className="text-xs text-slate-500 mt-1">
                            {item.pemohonNama}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <SlaHealthLabel
                            health={sla.health}
                            detailText={
                              sla.health === 'SELESAI'
                                ? undefined
                                : formatRemainingSla(sla.remainingHours)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Detail & E-Approval Panel (5 cols) */}
        <aside
          aria-label="Panel Detail dan E-Approval"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-5"
        >
          {!activeDetail ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Pilih salah satu permohonan pada daftar untuk meninjau detail, jadwal, dan jejak audit.
            </div>
          ) : (
            <>
              <div className="pb-4 border-b border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-blue-900 tabular-nums">
                    {activeDetail.nomorTiket} · {activeDetail.jenisKegiatan}
                  </span>
                  <ApprovalStatusLabel status={activeDetail.statusApproval} />
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1.5">
                  {activeDetail.judulPelatihan}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Pengusul: {activeDetail.pemohonNama} · {activeDetail.unitKerjaNama}
                </p>
              </div>

              {/* Resource & Schedule Summary */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs pb-4 border-b border-slate-200">
                <div>
                  <dt className="text-slate-500">Ruangan</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">
                    {activeRoom?.namaRuangan ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Pemateri</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">
                    {activeInstructor?.namaPemateri ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Waktu Pelaksanaan</dt>
                  <dd className="font-mono font-medium text-slate-900 mt-0.5 tabular-nums">
                    {activeReservation
                      ? `${new Date(activeReservation.waktuMulai).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}, ${new Date(activeReservation.waktuMulai).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}–${new Date(activeReservation.waktuSelesai).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}`
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status Kunci Slot</dt>
                  <dd className="mt-0.5">
                    {activeReservation ? (
                      <SlotStatusText status={activeReservation.statusSlot} />
                    ) : (
                      '-'
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Catatan Pemohon ({activeDetail.jumlahPeserta} peserta)</dt>
                  <dd className="text-slate-700 mt-0.5 leading-relaxed">
                    {activeDetail.catatanPemohon || 'Tidak ada catatan tambahan.'}
                  </dd>
                </div>
                {activeDetail.tteDocumentHash && (
                  <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                      <FileSignature className="w-4 h-4" aria-hidden="true" />
                      <span>Terverifikasi Tanda Tangan Elektronik (TTE)</span>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-900 mt-1 break-all">
                      Hash: {activeDetail.tteDocumentHash}
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Penandatangan: {activeDetail.tteSignedBy}
                    </div>
                  </div>
                )}
              </dl>

              {/* E-Approval Action Box */}
              <div className="space-y-3 pb-4 border-b border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">
                    Aksi E-Approval ({currentUser.roleLabel})
                  </span>
                  <span className="text-slate-500">
                    Tahap: {statusOrderHint(activeDetail.statusApproval)}
                  </span>
                </div>

                {actionFeedback && (
                  <div
                    role="status"
                    className={`p-2.5 rounded-md text-xs font-medium border ${
                      actionFeedback.type === 'error'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {actionFeedback.text}
                  </div>
                )}

                <div>
                  <label htmlFor="approval-note" className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan Disposisi / Revisi / Penolakan
                  </label>
                  <textarea
                    id="approval-note"
                    rows={2}
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Tambahkan catatan verifikasi atau alasan keputusan..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {canVerify && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAction('VERIFY_FORWARD')}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap cursor-pointer"
                      >
                        Disposisi ke Pimpinan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction('REQUEST_REVISION')}
                        className="px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md whitespace-nowrap cursor-pointer"
                      >
                        Minta Revisi
                      </button>
                    </>
                  )}

                  {canApproveTte && (
                    <button
                      type="button"
                      onClick={() => handleAction('APPROVE_TTE')}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap cursor-pointer"
                    >
                      Setujui & Tandatangani (TTE)
                    </button>
                  )}

                  {canReject && (
                    <button
                      type="button"
                      onClick={() => handleAction('REJECT')}
                      className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md whitespace-nowrap cursor-pointer"
                    >
                      Tolak & Lepas Slot
                    </button>
                  )}

                  {canResubmit && (
                    <button
                      type="button"
                      onClick={() => handleAction('RESUBMIT')}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap cursor-pointer"
                    >
                      Ajukan Ulang Revisi
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => handleAction('CANCEL')}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap cursor-pointer"
                    >
                      Batalkan Tiket
                    </button>
                  )}

                  {!canVerify && !canApproveTte && !canReject && !canResubmit && !canCancel && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Tidak ada aksi persetujuan tersedia untuk peran {currentUser.roleLabel} pada tahap ini.
                    </p>
                  )}
                </div>
              </div>

              {/* Immutable Audit Log Timeline */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 mb-3">
                  <History className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Jejak Audit Permanen (approval_logs)</span>
                </div>
                <ol className="space-y-3 border-l border-slate-200 ml-1.5 pl-4">
                  {activeLogs.map((log) => (
                    <li key={log.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{log.action}</span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(log.createdAt).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <div className="text-slate-600 mt-0.5">{log.note}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Aktor: {log.actorName} ({log.actorRole})
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
