import type {
  AppUser,
  ApprovalAction,
  ApprovalLog,
  ApprovalStatus,
  JadwalReservasi,
  NotificationItem,
  Permohonan,
} from '../types/simpel';

export interface TransitionResult {
  ok: boolean;
  error?: string;
  updatedPermohonan?: Permohonan;
  updatedReservations?: JadwalReservasi[];
  newLog?: ApprovalLog;
  newNotification?: NotificationItem;
}

function generateDeterministicHash(ticket: string, actorNip: string, isoTime: string): string {
  const raw = `${ticket}:${actorNip}:${isoTime}:TTE-SPBE`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `TTE-SHA256-${hex.toUpperCase()}-${ticket.replace(/[^A-Z0-9]/g, '')}`;
}

/**
 * Multi-level Centralized E-Approval State Machine (FR-06 & NFR-03 RBAC).
 * Enforces strict separation of duties:
 *   - PEMOHON: CANCEL (own request) or RESUBMIT (when PERLU_REVISI)
 *   - VERIFIKATOR: VERIFY_FORWARD -> MENUNGGU_APPROVAL_PIMPINAN, REQUEST_REVISION, REJECT
 *   - PIMPINAN: APPROVE_TTE -> DISETUJUI_TTE (locks CONFIRMED slot + TTE hash), REJECT
 *   - SUPER_ADMIN: All supervisory actions & SLA escalation oversight
 */
export function transitionPermohonanStatus(
  permohonan: Permohonan,
  reservations: JadwalReservasi[],
  action: ApprovalAction,
  actor: AppUser,
  note: string,
  nowDate: Date = new Date()
): TransitionResult {
  const nowIso = nowDate.toISOString();
  const prevStatus = permohonan.statusApproval;
  let nextStatus: ApprovalStatus | null = null;
  let nextLevel: 1 | 2 | 3 = permohonan.currentApprovalLevel;

  if (action === 'CANCEL') {
    if (actor.role !== 'PEMOHON' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'Hanya Pemohon atau Super Admin yang dapat membatalkan permohonan.' };
    }
    if (actor.role === 'PEMOHON' && permohonan.userId !== actor.id) {
      return { ok: false, error: 'Akses ditolak: Pemohon hanya dapat membatalkan permohonan milik unit sendiri.' };
    }
    if (prevStatus === 'DISETUJUI_TTE' || prevStatus === 'DITOLAK' || prevStatus === 'DIBATALKAN') {
      return { ok: false, error: `Permohonan dengan status ${prevStatus} tidak dapat dibatalkan.` };
    }
    nextStatus = 'DIBATALKAN';
  } else if (action === 'RESUBMIT') {
    if (actor.role !== 'PEMOHON' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'Hanya Pemohon yang dapat mengajukan ulang revisi.' };
    }
    if (prevStatus !== 'PERLU_REVISI') {
      return { ok: false, error: 'Pengajuan ulang hanya berlaku untuk status Perlu Revisi.' };
    }
    nextStatus = 'MENUNGGU_VERIFIKASI';
    nextLevel = 1;
  } else if (action === 'VERIFY_FORWARD') {
    if (actor.role !== 'VERIFIKATOR' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'RBAC Ditolak: Hanya Verifikator (Admin/Prakom) yang berwenang mendisposisi permohonan.' };
    }
    if (prevStatus !== 'MENUNGGU_VERIFIKASI') {
      return { ok: false, error: 'Disposisi hanya dapat dilakukan pada tahap Menunggu Verifikasi.' };
    }
    nextStatus = 'MENUNGGU_APPROVAL_PIMPINAN';
    nextLevel = 2;
  } else if (action === 'REQUEST_REVISION') {
    if (actor.role !== 'VERIFIKATOR' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'RBAC Ditolak: Hanya Verifikator yang dapat mengembalikan permohonan untuk revisi.' };
    }
    if (prevStatus !== 'MENUNGGU_VERIFIKASI') {
      return { ok: false, error: 'Permintaan revisi hanya berlaku pada tahap Menunggu Verifikasi.' };
    }
    if (!note.trim()) {
      return { ok: false, error: 'Catatan revisi wajib diisi agar Pemohon mengetahui perbaikan yang diperlukan.' };
    }
    nextStatus = 'PERLU_REVISI';
    nextLevel = 1;
  } else if (action === 'APPROVE_TTE') {
    if (actor.role !== 'PIMPINAN' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'RBAC Ditolak: Approval akhir TTE hanya dapat dilakukan oleh Pimpinan (Eselon/Kadis).' };
    }
    if (prevStatus !== 'MENUNGGU_APPROVAL_PIMPINAN') {
      return { ok: false, error: 'Bypass Ditolak: Permohonan harus melewati disposisi Verifikator sebelum TTE Pimpinan.' };
    }
    nextStatus = 'DISETUJUI_TTE';
    nextLevel = 3;
  } else if (action === 'REJECT') {
    if (actor.role !== 'VERIFIKATOR' && actor.role !== 'PIMPINAN' && actor.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'RBAC Ditolak: Anda tidak memiliki otoritas penolakan.' };
    }
    if (prevStatus !== 'MENUNGGU_VERIFIKASI' && prevStatus !== 'MENUNGGU_APPROVAL_PIMPINAN') {
      return { ok: false, error: 'Penolakan hanya berlaku untuk permohonan yang sedang diproses.' };
    }
    if (!note.trim()) {
      return { ok: false, error: 'Alasan penolakan wajib diisi untuk transparansi audit log.' };
    }
    nextStatus = 'DITOLAK';
  } else {
    return { ok: false, error: `Aksi ${action} tidak didukung pada alur manual.` };
  }

  const isTerminal = nextStatus === 'DISETUJUI_TTE' || nextStatus === 'DITOLAK' || nextStatus === 'DIBATALKAN';

  const updatedPermohonan: Permohonan = {
    ...permohonan,
    statusApproval: nextStatus,
    currentApprovalLevel: nextLevel,
    resolvedAt: isTerminal ? nowIso : permohonan.resolvedAt,
    tteDocumentHash:
      nextStatus === 'DISETUJUI_TTE'
        ? generateDeterministicHash(permohonan.nomorTiket, actor.nip, nowIso)
        : permohonan.tteDocumentHash,
    tteSignedBy: nextStatus === 'DISETUJUI_TTE' ? actor.nama : permohonan.tteSignedBy,
    tteSignedAt: nextStatus === 'DISETUJUI_TTE' ? nowIso : permohonan.tteSignedAt,
  };

  // Mirror PostgreSQL trigger `fn_sync_slot_status_from_permohonan()`
  const updatedReservations = reservations.map((res) => {
    if (res.permohonanId !== permohonan.id) return res;
    if (nextStatus === 'DITOLAK' || nextStatus === 'DIBATALKAN') {
      return { ...res, statusSlot: 'RELEASED' as const };
    }
    if (nextStatus === 'DISETUJUI_TTE') {
      return { ...res, statusSlot: 'CONFIRMED' as const };
    }
    return res;
  });

  const newLog: ApprovalLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    permohonanId: permohonan.id,
    userId: actor.id,
    actorName: actor.nama,
    actorRole: actor.roleLabel,
    action,
    previousStatus: prevStatus,
    newStatus: nextStatus,
    note: note.trim() || `Status diperbarui ke ${nextStatus}`,
    createdAt: nowIso,
  };

  const channel = nextStatus === 'DISETUJUI_TTE' || nextStatus === 'MENUNGGU_APPROVAL_PIMPINAN' ? 'WHATSAPP' : 'EMAIL';
  const newNotification: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    permohonanId: permohonan.id,
    nomorTiket: permohonan.nomorTiket,
    channel,
    recipientContact: channel === 'WHATSAPP' ? actor.noWhatsapp : actor.email,
    title: `${permohonan.nomorTiket}: ${nextStatus.replaceAll('_', ' ')}`,
    messageBody: `Permohonan "${permohonan.judulPelatihan}" diperbarui oleh ${actor.nama} (${actor.roleLabel}).`,
    createdAt: nowIso,
  };

  return {
    ok: true,
    updatedPermohonan,
    updatedReservations,
    newLog,
    newNotification,
  };
}
