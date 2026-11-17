import type { Permohonan, SlaHealthStatus } from '../types/simpel';

export interface SlaEvaluation {
  health: SlaHealthStatus;
  label: string;
  elapsedPercent: number;
  remainingHours: number;
  isEscalationDue: boolean;
}

const TERMINAL_STATUSES = new Set(['DISETUJUI_TTE', 'DITOLAK', 'DIBATALKAN']);

/**
 * Evaluates multi-stage SLA progress for a Permohonan (FR-07).
 * - Hijau (AMAN): < 75% of SLA duration elapsed
 * - Kuning (WARNING): 75% - 100% of SLA duration elapsed
 * - Merah (TERLEWAT): Past SLA deadline -> triggers automated escalation
 */
export function evaluateSlaStatus(permohonan: Permohonan, nowDate: Date = new Date()): SlaEvaluation {
  if (TERMINAL_STATUSES.has(permohonan.statusApproval)) {
    return {
      health: 'SELESAI',
      label: 'Selesai',
      elapsedPercent: 100,
      remainingHours: 0,
      isEscalationDue: false,
    };
  }

  const startMs = new Date(permohonan.waktuPengajuan).getTime();
  const deadlineMs = new Date(permohonan.slaDeadline).getTime();
  const nowMs = nowDate.getTime();

  const totalWindowMs = Math.max(1, deadlineMs - startMs);
  const elapsedMs = Math.max(0, nowMs - startMs);
  const rawPercent = (elapsedMs / totalWindowMs) * 100;
  const elapsedPercent = Math.min(200, Math.round(rawPercent));
  const remainingHours = Number(((deadlineMs - nowMs) / (1000 * 60 * 60)).toFixed(1));

  if (nowMs > deadlineMs) {
    return {
      health: 'TERLEWAT',
      label: 'SLA Terlewat (Eskalasi)',
      elapsedPercent,
      remainingHours,
      isEscalationDue: true,
    };
  }

  if (rawPercent >= 75) {
    return {
      health: 'WARNING',
      label: 'Mendekati Batas SLA',
      elapsedPercent,
      remainingHours,
      isEscalationDue: false,
    };
  }

  return {
    health: 'AMAN',
    label: 'Dalam Batas SLA',
    elapsedPercent,
    remainingHours,
    isEscalationDue: false,
  };
}

export function formatRemainingSla(remainingHours: number): string {
  if (remainingHours <= 0) {
    const overdueHours = Math.abs(remainingHours);
    if (overdueHours < 1) return `Lewat ${Math.max(1, Math.round(overdueHours * 60))} mnt`;
    return `Lewat ${overdueHours.toFixed(1)} jam`;
  }
  if (remainingHours < 1) {
    return `Sisa ${Math.max(1, Math.round(remainingHours * 60))} mnt`;
  }
  return `Sisa ${remainingHours.toFixed(1)} jam`;
}
