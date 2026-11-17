import { AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  type AlternativeSlotSuggestion,
  detectScheduleConflicts,
} from '../domain/scheduling';
import type {
  AppUser,
  FasilitasRuangan,
  JadwalReservasi,
  Pemateri,
  Permohonan,
} from '../types/simpel';

export interface NewBookingPayload {
  judulPelatihan: string;
  jenisKegiatan: Permohonan['jenisKegiatan'];
  jumlahPeserta: number;
  ruanganId: string;
  pemateriId: string;
  waktuMulai: string;
  waktuSelesai: string;
  catatanPemohon: string;
}

interface BookingModalProps {
  isOpen: boolean;
  currentUser: AppUser;
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  reservations: JadwalReservasi[];
  permohonanList: Permohonan[];
  prefill?: { ruanganId?: string; dateStr?: string; startHour?: number } | null;
  onClose: () => void;
  onSubmitBooking: (payload: NewBookingPayload) => void;
}

function defaultDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function BookingModal({
  isOpen,
  currentUser,
  rooms,
  instructors,
  reservations,
  permohonanList,
  prefill,
  onClose,
  onSubmitBooking,
}: BookingModalProps) {
  const activeRooms = useMemo(() => rooms.filter((r) => r.isActive), [rooms]);
  const activeInstructors = useMemo(() => instructors.filter((i) => i.isActive), [instructors]);

  const [judulPelatihan, setJudulPelatihan] = useState('');
  const [jenisKegiatan, setJenisKegiatan] = useState<Permohonan['jenisKegiatan']>('Workshop SPBE');
  const [jumlahPeserta, setJumlahPeserta] = useState(30);
  const [ruanganId, setRuanganId] = useState(activeRooms[0]?.id ?? '');
  const [pemateriId, setPemateriId] = useState(activeInstructors[0]?.id ?? '');
  const [dateStr, setDateStr] = useState(defaultDateStr);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [catatanPemohon, setCatatanPemohon] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    if (prefill?.ruanganId) setRuanganId(prefill.ruanganId);
    else if (activeRooms[0]) setRuanganId(activeRooms[0].id);

    if (activeInstructors[0]) setPemateriId(activeInstructors[0].id);

    if (prefill?.dateStr) setDateStr(prefill.dateStr);
    else setDateStr(defaultDateStr());

    if (typeof prefill?.startHour === 'number') {
      const sH = String(prefill.startHour).padStart(2, '0');
      const eH = String(Math.min(18, prefill.startHour + 2)).padStart(2, '0');
      setStartTime(`${sH}:00`);
      setEndTime(`${eH}:00`);
    } else {
      setStartTime('09:00');
      setEndTime('12:00');
    }
  }, [isOpen, prefill, activeRooms, activeInstructors]);

  const waktuMulaiIso = useMemo(() => {
    const dt = new Date(`${dateStr}T${startTime}:00`);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
  }, [dateStr, startTime]);

  const waktuSelesaiIso = useMemo(() => {
    const dt = new Date(`${dateStr}T${endTime}:00`);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
  }, [dateStr, endTime]);

  const conflictReport = useMemo(() => {
    if (!ruanganId || !pemateriId || !waktuMulaiIso || !waktuSelesaiIso) {
      return { hasConflict: false, conflicts: [], suggestions: [] };
    }
    return detectScheduleConflicts(
      {
        ruanganId,
        pemateriId,
        waktuMulai: waktuMulaiIso,
        waktuSelesai: waktuSelesaiIso,
        jumlahPeserta: Number(jumlahPeserta) || 0,
      },
      reservations,
      rooms,
      instructors,
      permohonanList
    );
  }, [ruanganId, pemateriId, waktuMulaiIso, waktuSelesaiIso, jumlahPeserta, reservations, rooms, instructors, permohonanList]);

  if (!isOpen) return null;

  function applySuggestion(s: AlternativeSlotSuggestion) {
    setRuanganId(s.ruanganId);
    setPemateriId(s.pemateriId);
    const startD = new Date(s.waktuMulai);
    const endD = new Date(s.waktuSelesai);
    const y = startD.getFullYear();
    const m = String(startD.getMonth() + 1).padStart(2, '0');
    const day = String(startD.getDate()).padStart(2, '0');
    setDateStr(`${y}-${m}-${day}`);
    setStartTime(
      `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`
    );
    setEndTime(
      `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!judulPelatihan.trim()) {
      setFormError('Judul pelatihan wajib diisi.');
      return;
    }
    if (jumlahPeserta <= 0) {
      setFormError('Jumlah peserta minimal 1 orang.');
      return;
    }
    if (conflictReport.hasConflict) {
      setFormError('Pengajuan ditolak otomatis karena terdeteksi bentrok jadwal/kapasitas. Pilih rekomendasi slot alternatif.');
      return;
    }

    onSubmitBooking({
      judulPelatihan: judulPelatihan.trim(),
      jenisKegiatan,
      jumlahPeserta,
      ruanganId,
      pemateriId,
      waktuMulai: waktuMulaiIso,
      waktuSelesai: waktuSelesaiIso,
      catatanPemohon: catatanPemohon.trim(),
    });
    setJudulPelatihan('');
    setCatatanPemohon('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 id="booking-modal-title" className="text-lg font-bold text-slate-900">
              Ajukan Permohonan Pelatihan (1 Pintu)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pengusul: {currentUser.nama} · {currentUser.unitKerjaNama} · Target SLA 2x24 jam
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            aria-label="Tutup form pengajuan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {formError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs font-medium text-red-800">
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="booking-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Judul Pelatihan / Kegiatan
              </label>
              <input
                id="booking-title"
                type="text"
                required
                value={judulPelatihan}
                onChange={(e) => setJudulPelatihan(e.target.value)}
                placeholder="Contoh: Bimbingan Teknis Integrasi Layanan SPBE Daerah"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="booking-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Kegiatan
                </label>
                <select
                  id="booking-type"
                  value={jenisKegiatan}
                  onChange={(e) => setJenisKegiatan(e.target.value as Permohonan['jenisKegiatan'])}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  <option value="Diklat Teknis">Diklat Teknis</option>
                  <option value="Workshop SPBE">Workshop SPBE</option>
                  <option value="Bimbingan Teknis">Bimbingan Teknis</option>
                  <option value="Rapat Koordinasi">Rapat Koordinasi</option>
                </select>
              </div>
              <div>
                <label htmlFor="booking-participants" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jumlah Peserta
                </label>
                <input
                  id="booking-participants"
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={jumlahPeserta}
                  onChange={(e) => setJumlahPeserta(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="booking-room" className="block text-xs font-semibold text-slate-700 mb-1">
                  Fasilitas Ruangan
                </label>
                <select
                  id="booking-room"
                  value={ruanganId}
                  onChange={(e) => setRuanganId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.namaRuangan} (Kap. {r.kapasitas})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="booking-instructor" className="block text-xs font-semibold text-slate-700 mb-1">
                  Pemateri / Instruktur
                </label>
                <select
                  id="booking-instructor"
                  value={pemateriId}
                  onChange={(e) => setPemateriId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  {activeInstructors.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.namaPemateri}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="booking-date" className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Pelaksanaan
                </label>
                <input
                  id="booking-date"
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>
              <div>
                <label htmlFor="booking-start" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jam Mulai
                </label>
                <input
                  id="booking-start"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>
              <div>
                <label htmlFor="booking-end" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jam Selesai
                </label>
                <input
                  id="booking-end"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>
            </div>

            {/* Live Auto-Conflict Detection Banner */}
            {conflictReport.hasConflict ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="text-xs space-y-1">
                    <div className="font-semibold">
                      Auto-Conflict Detection: Jadwal Ditolak (Bentrok Terdeteksi)
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {conflictReport.conflicts.map((c, idx) => (
                        <li key={idx}>{c.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {conflictReport.suggestions.length > 0 && (
                  <div className="pt-3 border-t border-red-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <Sparkles className="w-3.5 h-3.5 text-blue-900" aria-hidden="true" />
                      <span>Rekomendasi Smart Scheduling Engine (Bebas Bentrok):</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {conflictReport.suggestions.map((s) => {
                        const st = new Date(s.waktuMulai);
                        const en = new Date(s.waktuSelesai);
                        const label = `${st.toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                        })} ${st.toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}–${en.toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}`;
                        return (
                          <div
                            key={s.id}
                            className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="text-xs">
                              <div className="font-semibold text-slate-900">
                                {s.ruanganNama} · <span className="font-mono tabular-nums">{label}</span>
                              </div>
                              <div className="text-slate-500 mt-0.5">{s.reason}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applySuggestion(s)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Gunakan Slot Ini
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3.5 py-2.5 flex items-center gap-2 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Validasi GiST Range Lolos: Ruangan, kapasitas peserta, dan jadwal pemateri tersedia.
                </span>
              </div>
            )}

            <div>
              <label htmlFor="booking-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                Kebutuhan Teknis / Catatan Pemohon
              </label>
              <textarea
                id="booking-notes"
                rows={2}
                value={catatanPemohon}
                onChange={(e) => setCatatanPemohon(e.target.value)}
                placeholder="Contoh: Membutuhkan proyektor ganda, perekaman Zoom, dan konsumsi peserta."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>
          </div>

          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={conflictReport.hasConflict}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-md cursor-pointer"
            >
              Kunci Jadwal & Ajukan (Mulai SLA)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
