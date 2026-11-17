import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  FasilitasRuangan,
  JadwalReservasi,
  Pemateri,
  Permohonan,
} from '../types/simpel';
import { SlotStatusText } from './StatusLabel';

interface SmartCalendarViewProps {
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  reservations: JadwalReservasi[];
  permohonanList: Permohonan[];
  onQuickBookSlot: (ruanganId: string, dateStr: string, startHour: number) => void;
  onInspectPermohonan: (permohonanId: string) => void;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function toLocalDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SmartCalendarView({
  rooms,
  instructors,
  reservations,
  permohonanList,
  onQuickBookSlot,
  onInspectPermohonan,
}: SmartCalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateInput(new Date()));

  const permohonanMap = useMemo(
    () => new Map(permohonanList.map((p) => [p.id, p])),
    [permohonanList]
  );
  const instructorMap = useMemo(
    () => new Map(instructors.map((i) => [i.id, i])),
    [instructors]
  );

  const dayReservations = useMemo(() => {
    return reservations.filter((res) => {
      if (res.statusSlot === 'RELEASED') return false;
      const d = new Date(res.waktuMulai);
      return toLocalDateInput(d) === selectedDate;
    });
  }, [reservations, selectedDate]);

  function shiftDate(days: number) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + days);
    setSelectedDate(toLocalDateInput(next));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center border border-slate-300 rounded-md overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-2 text-slate-600 hover:bg-slate-50 border-r border-slate-300 cursor-pointer"
              aria-label="Hari sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label htmlFor="calendar-date-input" className="sr-only">
              Pilih tanggal kalender
            </label>
            <input
              id="calendar-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-sm font-medium text-slate-900 tabular-nums focus:outline-none"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-2 text-slate-600 hover:bg-slate-50 border-l border-slate-300 cursor-pointer"
              aria-label="Hari berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(toLocalDateInput(new Date()))}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap cursor-pointer"
          >
            Hari Ini
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-900" aria-hidden="true" />
            Proteksi GiST Overlap Aktif
          </span>
          <span className="text-slate-300" aria-hidden="true">|</span>
          <span className="tabular-nums font-medium">
            {dayReservations.length} jadwal aktif pada tanggal ini
          </span>
        </div>
      </div>

      {/* Room x Hour Smart Calendar Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-48 border-r border-slate-200">Fasilitas Ruangan</th>
                {HOURS.map((h) => (
                  <th
                    key={h}
                    className="py-3 px-1.5 text-center font-mono tabular-nums border-r border-slate-200 last:border-r-0"
                  >
                    {String(h).padStart(2, '0')}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rooms
                .filter((r) => r.isActive)
                .map((room) => {
                  const roomSlots = dayReservations.filter((res) => res.ruanganId === room.id);

                  return (
                    <tr key={room.id} className="align-top">
                      <td className="py-3 px-4 border-r border-slate-200 bg-slate-50/40">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {room.namaRuangan}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 tabular-nums truncate">
                          {room.kodeRuangan} · Kap. {room.kapasitas} org
                        </div>
                      </td>

                      {HOURS.map((hour) => {
                        const slotStart = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:00:00`);
                        const slotEnd = new Date(`${selectedDate}T${String(hour + 1).padStart(2, '0')}:00:00`);

                        const matching = roomSlots.find((res) => {
                          const s = new Date(res.waktuMulai).getTime();
                          const e = new Date(res.waktuSelesai).getTime();
                          return s < slotEnd.getTime() && slotStart.getTime() < e;
                        });

                        if (matching) {
                          const perm = permohonanMap.get(matching.permohonanId);
                          const inst = instructorMap.get(matching.pemateriId);
                          const isConfirmed = matching.statusSlot === 'CONFIRMED';

                          return (
                            <td
                              key={hour}
                              className="p-1 border-r border-slate-200 last:border-r-0 overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() => perm && onInspectPermohonan(perm.id)}
                                className={`w-full h-20 text-left p-1.5 rounded border transition-colors cursor-pointer overflow-hidden flex flex-col justify-between ${
                                  isConfirmed
                                    ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70'
                                    : 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
                                }`}
                                aria-label={`Lihat jadwal ${perm?.nomorTiket ?? ''} di ${room.namaRuangan} jam ${hour}:00`}
                              >
                                <div className="min-w-0">
                                  <div className="font-mono text-[10px] font-semibold text-slate-900 tabular-nums truncate">
                                    {perm?.nomorTiket ?? 'TIKET'}
                                  </div>
                                  <div className="text-[11px] font-medium text-slate-800 truncate mt-0.5">
                                    {perm?.judulPelatihan ?? 'Pelatihan'}
                                  </div>
                                  <div className="text-[10px] text-slate-600 truncate">
                                    {inst?.namaPemateri ?? '-'}
                                  </div>
                                </div>
                                <div className="truncate">
                                  <SlotStatusText status={matching.statusSlot} />
                                </div>
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={hour}
                            className="p-1 border-r border-slate-200 last:border-r-0"
                          >
                            <button
                              type="button"
                              onClick={() => onQuickBookSlot(room.id, selectedDate, hour)}
                              className="w-full h-20 rounded border border-dashed border-slate-200 hover:border-blue-800 hover:bg-blue-50/40 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-900 transition-colors cursor-pointer group"
                              aria-label={`Pesan ${room.namaRuangan} tanggal ${selectedDate} pukul ${String(hour).padStart(2, '0')}:00`}
                            >
                              <Plus className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" aria-hidden="true" />
                              <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100">
                                Kosong
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming Schedule Summary List */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-blue-900" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Daftar Slot Terkunci ({selectedDate})
            </h2>
          </div>
          <span className="text-xs text-slate-500">Klik baris untuk melihat detail & audit log</span>
        </div>
        {dayReservations.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            Belum ada reservasi aktif pada {selectedDate}. Klik salah satu slot kosong di atas untuk mengajukan pelatihan.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 mt-2">
            {dayReservations.map((res) => {
              const perm = permohonanMap.get(res.permohonanId);
              const room = rooms.find((r) => r.id === res.ruanganId);
              const inst = instructorMap.get(res.pemateriId);
              const sTime = new Date(res.waktuMulai).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const eTime = new Date(res.waktuSelesai).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });

              return (
                <li key={res.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-blue-900 tabular-nums">
                        {perm?.nomorTiket}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {sTime}–{eTime}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{room?.namaRuangan}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {perm?.judulPelatihan}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Pemateri: {inst?.namaPemateri} · {perm?.unitKerjaNama}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <SlotStatusText status={res.statusSlot} />
                    <button
                      type="button"
                      onClick={() => perm && onInspectPermohonan(perm.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                    >
                      Detail
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
