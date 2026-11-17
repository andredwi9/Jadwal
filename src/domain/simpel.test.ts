import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectScheduleConflicts,
  getInstructorWeeklyHours,
  hasTimeOverlap,
} from './scheduling';
import { evaluateSlaStatus } from './sla';
import { transitionPermohonanStatus } from './approval';
import {
  createInitialSeedState,
  INITIAL_INSTRUCTORS,
  INITIAL_ROOMS,
  INITIAL_USERS,
} from '../data/seedData';

const FIXED_NOW = new Date('2026-11-17T08:00:00.000Z');

test('hasTimeOverlap treats half-open boundaries [start, end) as non-conflicting', () => {
  assert.equal(
    hasTimeOverlap(
      '2026-11-17T08:00:00.000Z',
      '2026-11-17T10:00:00.000Z',
      '2026-11-17T10:00:00.000Z',
      '2026-11-17T12:00:00.000Z'
    ),
    false
  );

  assert.equal(
    hasTimeOverlap(
      '2026-11-17T08:00:00.000Z',
      '2026-11-17T10:30:00.000Z',
      '2026-11-17T10:00:00.000Z',
      '2026-11-17T12:00:00.000Z'
    ),
    true
  );
});

test('detectScheduleConflicts catches room & instructor overlaps and suggests alternatives', () => {
  const seed = createInitialSeedState(FIXED_NOW);
  const existing = seed.reservations[0]; // room-1 & inst-1

  const result = detectScheduleConflicts(
    {
      ruanganId: existing.ruanganId,
      pemateriId: existing.pemateriId,
      waktuMulai: existing.waktuMulai,
      waktuSelesai: existing.waktuSelesai,
      jumlahPeserta: 30,
    },
    seed.reservations,
    INITIAL_ROOMS,
    INITIAL_INSTRUCTORS,
    seed.permohonan
  );

  assert.equal(result.hasConflict, true);
  assert.ok(result.conflicts.some((c) => c.type === 'ROOM_OVERLAP'));
  assert.ok(result.conflicts.some((c) => c.type === 'INSTRUCTOR_OVERLAP'));
  assert.ok(result.suggestions.length > 0);
});

test('detectScheduleConflicts enforces room capacity and instructor weekly max hours', () => {
  const seed = createInitialSeedState(FIXED_NOW);
  const res = detectScheduleConflicts(
    {
      ruanganId: 'room-3', // Kapasitas 25
      pemateriId: 'inst-2',
      waktuMulai: '2026-11-20T09:00:00.000Z',
      waktuSelesai: '2026-11-20T12:00:00.000Z',
      jumlahPeserta: 50,
    },
    seed.reservations,
    INITIAL_ROOMS,
    INITIAL_INSTRUCTORS,
    seed.permohonan
  );

  assert.equal(res.hasConflict, true);
  assert.ok(res.conflicts.some((c) => c.type === 'CAPACITY_EXCEEDED'));

  const weekly = getInstructorWeeklyHours('inst-1', existingDateFromSeed(seed.reservations[0].waktuMulai), seed.reservations);
  assert.ok(weekly >= 3);
});

function existingDateFromSeed(iso: string): string {
  return iso;
}

test('evaluateSlaStatus distinguishes AMAN, WARNING (>=75%), TERLEWAT (>100%), and SELESAI', () => {
  const seed = createInitialSeedState(FIXED_NOW);

  const selesai = evaluateSlaStatus(seed.permohonan[0], FIXED_NOW);
  assert.equal(selesai.health, 'SELESAI');

  const warning = evaluateSlaStatus(seed.permohonan[1], FIXED_NOW);
  assert.equal(warning.health, 'WARNING');
  assert.equal(warning.isEscalationDue, false);

  const terlewat = evaluateSlaStatus(seed.permohonan[2], FIXED_NOW);
  assert.equal(terlewat.health, 'TERLEWAT');
  assert.equal(terlewat.isEscalationDue, true);

  const aman = evaluateSlaStatus(seed.permohonan[3], FIXED_NOW);
  assert.equal(aman.health, 'AMAN');
});

test('transitionPermohonanStatus enforces RBAC, prevents approval bypass, and syncs slot release', () => {
  const seed = createInitialSeedState(FIXED_NOW);
  const pemohon = INITIAL_USERS.find((u) => u.role === 'PEMOHON')!;
  const verifikator = INITIAL_USERS.find((u) => u.role === 'VERIFIKATOR')!;
  const pimpinan = INITIAL_USERS.find((u) => u.role === 'PIMPINAN')!;

  const pendingVerif = seed.permohonan.find((p) => p.statusApproval === 'MENUNGGU_VERIFIKASI')!;

  // Bypass attempt by Pimpinan before Verifikator disposisi must fail
  const bypassAttempt = transitionPermohonanStatus(
    pendingVerif,
    seed.reservations,
    'APPROVE_TTE',
    pimpinan,
    'Coba bypass langsung',
    FIXED_NOW
  );
  assert.equal(bypassAttempt.ok, false);

  // Pemohon cannot verify/forward
  const unauthorizedVerify = transitionPermohonanStatus(
    pendingVerif,
    seed.reservations,
    'VERIFY_FORWARD',
    pemohon,
    'Verify sendiri',
    FIXED_NOW
  );
  assert.equal(unauthorizedVerify.ok, false);

  // Verifikator forwards -> Pimpinan approves TTE -> slot becomes CONFIRMED
  const step1 = transitionPermohonanStatus(
    pendingVerif,
    seed.reservations,
    'VERIFY_FORWARD',
    verifikator,
    'Berkas lengkap, disposisi ke Pimpinan.',
    FIXED_NOW
  );
  assert.equal(step1.ok, true);
  assert.equal(step1.updatedPermohonan!.statusApproval, 'MENUNGGU_APPROVAL_PIMPINAN');

  const step2 = transitionPermohonanStatus(
    step1.updatedPermohonan!,
    step1.updatedReservations!,
    'APPROVE_TTE',
    pimpinan,
    'Disetujui penuh.',
    FIXED_NOW
  );
  assert.equal(step2.ok, true);
  assert.equal(step2.updatedPermohonan!.statusApproval, 'DISETUJUI_TTE');
  assert.ok(step2.updatedPermohonan!.tteDocumentHash?.startsWith('TTE-SHA256-'));

  const syncedSlot = step2.updatedReservations!.find((r) => r.permohonanId === pendingVerif.id);
  assert.equal(syncedSlot?.statusSlot, 'CONFIRMED');

  // Rejecting a request releases the slot
  const rejected = transitionPermohonanStatus(
    pendingVerif,
    seed.reservations,
    'REJECT',
    verifikator,
    'Anggaran belum disahkan.',
    FIXED_NOW
  );
  assert.equal(rejected.ok, true);
  const releasedSlot = rejected.updatedReservations!.find((r) => r.permohonanId === pendingVerif.id);
  assert.equal(releasedSlot?.statusSlot, 'RELEASED');
});
