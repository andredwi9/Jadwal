import type {
  FasilitasRuangan,
  JadwalReservasi,
  Pemateri,
  Permohonan,
} from '../types/simpel';

export interface BookingValidationInput {
  ruanganId: string;
  pemateriId: string;
  waktuMulai: string;
  waktuSelesai: string;
  jumlahPeserta: number;
  excludePermohonanId?: string;
}

export interface ConflictDetail {
  type: 'ROOM_OVERLAP' | 'INSTRUCTOR_OVERLAP' | 'CAPACITY_EXCEEDED' | 'INSTRUCTOR_LOAD_EXCEEDED' | 'INVALID_TIME' | 'INACTIVE_RESOURCE';
  message: string;
  conflictingPermohonanId?: string;
  conflictingTicket?: string;
  conflictingTimeRange?: string;
}

export interface AlternativeSlotSuggestion {
  id: string;
  ruanganId: string;
  ruanganNama: string;
  pemateriId: string;
  pemateriNama: string;
  waktuMulai: string;
  waktuSelesai: string;
  reason: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
  suggestions: AlternativeSlotSuggestion[];
}

/**
 * Half-open interval overlap check: [aStart, aEnd) && [bStart, bEnd).
 * Mirrors PostgreSQL's `tstzrange(waktu_mulai, waktu_selesai, '[)') && ...`
 * so consecutive back-to-back sessions (e.g. 08:00-10:00 and 10:00-12:00) do NOT conflict.
 */
export function hasTimeOverlap(
  aStartIso: string,
  aEndIso: string,
  bStartIso: string,
  bEndIso: string
): boolean {
  const aStart = new Date(aStartIso).getTime();
  const aEnd = new Date(aEndIso).getTime();
  const bStart = new Date(bStartIso).getTime();
  const bEnd = new Date(bEndIso).getTime();

  if (Number.isNaN(aStart) || Number.isNaN(aEnd) || Number.isNaN(bStart) || Number.isNaN(bEnd)) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
}

export function getDurationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

function getWeekBounds(isoDate: string): { weekStartMs: number; weekEndMs: number } {
  const d = new Date(isoDate);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diffToMonday);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { weekStartMs: monday.getTime(), weekEndMs: nextMonday.getTime() };
}

/**
 * Calculates weekly scheduled teaching hours for an instructor based on active reservations.
 */
export function getInstructorWeeklyHours(
  pemateriId: string,
  referenceIso: string,
  reservations: JadwalReservasi[],
  excludePermohonanId?: string
): number {
  const { weekStartMs, weekEndMs } = getWeekBounds(referenceIso);
  let totalHours = 0;

  for (const res of reservations) {
    if (res.statusSlot === 'RELEASED') continue;
    if (res.pemateriId !== pemateriId) continue;
    if (excludePermohonanId && res.permohonanId === excludePermohonanId) continue;

    const startMs = new Date(res.waktuMulai).getTime();
    if (startMs >= weekStartMs && startMs < weekEndMs) {
      totalHours += getDurationHours(res.waktuMulai, res.waktuSelesai);
    }
  }
  return Number(totalHours.toFixed(2));
}

function formatShortTimeWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const datePart = s.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const sTime = s.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  const eTime = e.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart}, ${sTime}–${eTime}`;
}

/**
 * Core Auto-Conflict Detection Engine (FR-05 & NFR-02).
 * Evaluates room overlap, instructor overlap, room capacity, and instructor weekly load limits.
 */
export function detectScheduleConflicts(
  input: BookingValidationInput,
  reservations: JadwalReservasi[],
  rooms: FasilitasRuangan[],
  instructors: Pemateri[],
  permohonanList: Permohonan[] = []
): ConflictCheckResult {
  const conflicts: ConflictDetail[] = [];

  const startMs = new Date(input.waktuMulai).getTime();
  const endMs = new Date(input.waktuSelesai).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    conflicts.push({
      type: 'INVALID_TIME',
      message: 'Waktu selesai harus lebih besar dari waktu mulai pelatihan.',
    });
    return { hasConflict: true, conflicts, suggestions: [] };
  }

  const durationHours = getDurationHours(input.waktuMulai, input.waktuSelesai);
  if (durationHours < 0.5) {
    conflicts.push({
      type: 'INVALID_TIME',
      message: 'Durasi minimal pemesanan fasilitas adalah 30 menit.',
    });
    return { hasConflict: true, conflicts, suggestions: [] };
  }

  const room = rooms.find((r) => r.id === input.ruanganId);
  const instructor = instructors.find((i) => i.id === input.pemateriId);

  if (!room || !room.isActive) {
    conflicts.push({
      type: 'INACTIVE_RESOURCE',
      message: 'Ruangan yang dipilih tidak ditemukan atau sedang non-aktif.',
    });
  } else if (input.jumlahPeserta > room.kapasitas) {
    conflicts.push({
      type: 'CAPACITY_EXCEEDED',
      message: `Jumlah peserta (${input.jumlahPeserta} orang) melebihi kapasitas ${room.namaRuangan} (maks. ${room.kapasitas} orang).`,
    });
  }

  if (!instructor || !instructor.isActive) {
    conflicts.push({
      type: 'INACTIVE_RESOURCE',
      message: 'Pemateri yang dipilih tidak ditemukan atau sedang tidak aktif.',
    });
  } else {
    const currentWeeklyHours = getInstructorWeeklyHours(
      instructor.id,
      input.waktuMulai,
      reservations,
      input.excludePermohonanId
    );
    if (currentWeeklyHours + durationHours > instructor.maxJamMengajarMingguan) {
      conflicts.push({
        type: 'INSTRUCTOR_LOAD_EXCEEDED',
        message: `Beban mengajar ${instructor.namaPemateri} minggu ini (${currentWeeklyHours} jam + ${durationHours.toFixed(1)} jam) melampaui batas maksimal (${instructor.maxJamMengajarMingguan} jam/minggu).`,
      });
    }
  }

  const ticketByPermohonanId = new Map(permohonanList.map((p) => [p.id, p]));

  // Check active reservations (LOCKED_PENDING or CONFIRMED)
  for (const res of reservations) {
    if (res.statusSlot === 'RELEASED') continue;
    if (input.excludePermohonanId && res.permohonanId === input.excludePermohonanId) continue;

    if (!hasTimeOverlap(input.waktuMulai, input.waktuSelesai, res.waktuMulai, res.waktuSelesai)) {
      continue;
    }

    const linked = ticketByPermohonanId.get(res.permohonanId);
    const timeLabel = formatShortTimeWindow(res.waktuMulai, res.waktuSelesai);

    if (res.ruanganId === input.ruanganId) {
      conflicts.push({
        type: 'ROOM_OVERLAP',
        message: `Bentrok Ruangan (GiST excl_no_room_time_overlap): ${room?.namaRuangan ?? 'Ruangan'} sudah terkunci pada ${timeLabel}${linked ? ` oleh ${linked.nomorTiket} (${linked.judulPelatihan})` : ''}.`,
        conflictingPermohonanId: res.permohonanId,
        conflictingTicket: linked?.nomorTiket,
        conflictingTimeRange: timeLabel,
      });
    }

    if (res.pemateriId === input.pemateriId) {
      conflicts.push({
        type: 'INSTRUCTOR_OVERLAP',
        message: `Bentrok Instruktur (GiST excl_no_instructor_time_overlap): ${instructor?.namaPemateri ?? 'Pemateri'} sudah terjadwal pada ${timeLabel}${linked ? ` untuk ${linked.nomorTiket}` : ''}.`,
        conflictingPermohonanId: res.permohonanId,
        conflictingTicket: linked?.nomorTiket,
        conflictingTimeRange: timeLabel,
      });
    }
  }

  const suggestions =
    conflicts.length > 0
      ? recommendAlternativeSlots(input, reservations, rooms, instructors, 4)
      : [];

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestions,
  };
}

function hasRawSlotConflict(
  ruanganId: string,
  pemateriId: string,
  startIso: string,
  endIso: string,
  jumlahPeserta: number,
  reservations: JadwalReservasi[],
  rooms: FasilitasRuangan[],
  instructors: Pemateri[],
  excludePermohonanId?: string
): boolean {
  const room = rooms.find((r) => r.id === ruanganId);
  const inst = instructors.find((i) => i.id === pemateriId);
  if (!room || !room.isActive || jumlahPeserta > room.kapasitas) return true;
  if (!inst || !inst.isActive) return true;

  const durationHours = getDurationHours(startIso, endIso);
  const weekly = getInstructorWeeklyHours(pemateriId, startIso, reservations, excludePermohonanId);
  if (weekly + durationHours > inst.maxJamMengajarMingguan) return true;

  return reservations.some((res) => {
    if (res.statusSlot === 'RELEASED') return false;
    if (excludePermohonanId && res.permohonanId === excludePermohonanId) return false;
    if (!hasTimeOverlap(startIso, endIso, res.waktuMulai, res.waktuSelesai)) return false;
    return res.ruanganId === ruanganId || res.pemateriId === pemateriId;
  });
}

/**
 * Smart Scheduling Engine (FR-10): Suggests conflict-free alternative rooms or shifted time slots.
 */
export function recommendAlternativeSlots(
  input: BookingValidationInput,
  reservations: JadwalReservasi[],
  rooms: FasilitasRuangan[],
  instructors: Pemateri[],
  maxSuggestions = 4
): AlternativeSlotSuggestion[] {
  const suggestions: AlternativeSlotSuggestion[] = [];
  const startMs = new Date(input.waktuMulai).getTime();
  const endMs = new Date(input.waktuSelesai).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return [];

  const durationMs = endMs - startMs;
  const selectedInstructor = instructors.find((i) => i.id === input.pemateriId);
  const selectedRoom = rooms.find((r) => r.id === input.ruanganId);

  // Strategy 1: Keep exact date/time & instructor, swap to an available room with adequate capacity
  for (const altRoom of rooms) {
    if (!altRoom.isActive || altRoom.id === input.ruanganId) continue;
    if (altRoom.kapasitas < input.jumlahPeserta) continue;
    if (
      selectedInstructor &&
      !hasRawSlotConflict(
        altRoom.id,
        selectedInstructor.id,
        input.waktuMulai,
        input.waktuSelesai,
        input.jumlahPeserta,
        reservations,
        rooms,
        instructors,
        input.excludePermohonanId
      )
    ) {
      suggestions.push({
        id: `alt-room-${altRoom.id}`,
        ruanganId: altRoom.id,
        ruanganNama: altRoom.namaRuangan,
        pemateriId: selectedInstructor.id,
        pemateriNama: selectedInstructor.namaPemateri,
        waktuMulai: input.waktuMulai,
        waktuSelesai: input.waktuSelesai,
        reason: `Ruangan alternatif (${altRoom.kapasitas} kursi) tersedia pada jam yang sama`,
      });
      if (suggestions.length >= maxSuggestions) return suggestions;
    }
  }

  // Strategy 2: Keep chosen room (if capacity allows) & instructor, shift time forward (+2h, +4h, +1 day, +2 days)
  if (selectedRoom && selectedRoom.isActive && selectedRoom.kapasitas >= input.jumlahPeserta && selectedInstructor) {
    const hourOffsets = [2, 3, 24, 26, 48];
    for (const offsetHours of hourOffsets) {
      const candStart = new Date(startMs + offsetHours * 3600 * 1000);
      const candEnd = new Date(candStart.getTime() + durationMs);
      // Restrict recommended business hours between 07:30 and 18:30
      if (candStart.getHours() < 7 || candEnd.getHours() > 19) continue;

      const candStartIso = candStart.toISOString();
      const candEndIso = candEnd.toISOString();

      if (
        !hasRawSlotConflict(
          selectedRoom.id,
          selectedInstructor.id,
          candStartIso,
          candEndIso,
          input.jumlahPeserta,
          reservations,
          rooms,
          instructors,
          input.excludePermohonanId
        )
      ) {
        suggestions.push({
          id: `alt-time-${offsetHours}`,
          ruanganId: selectedRoom.id,
          ruanganNama: selectedRoom.namaRuangan,
          pemateriId: selectedInstructor.id,
          pemateriNama: selectedInstructor.namaPemateri,
          waktuMulai: candStartIso,
          waktuSelesai: candEndIso,
          reason:
            offsetHours < 24
              ? `Slot waktu geser +${offsetHours} jam di hari yang sama bebas bentrok`
              : `Slot waktu hari berikutnya bebas bentrok`,
        });
        if (suggestions.length >= maxSuggestions) return suggestions;
      }
    }
  }

  return suggestions;
}
