import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import type { ApprovalStatus, ReservationSlotStatus, SlaHealthStatus } from '../types/simpel';

export function ApprovalStatusLabel({ status }: { status: ApprovalStatus }) {
  switch (status) {
    case 'DISETUJUI_TTE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Disetujui (TTE)
        </span>
      );
    case 'MENUNGGU_APPROVAL_PIMPINAN':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Menunggu Pimpinan
        </span>
      );
    case 'MENUNGGU_VERIFIKASI':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Menunggu Verifikasi
        </span>
      );
    case 'PERLU_REVISI':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Perlu Revisi
        </span>
      );
    case 'DITOLAK':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Ditolak
        </span>
      );
    case 'DIBATALKAN':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Dibatalkan
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          Draft
        </span>
      );
  }
}

export function SlaHealthLabel({
  health,
  detailText,
}: {
  health: SlaHealthStatus;
  detailText?: string;
}) {
  if (health === 'TERLEWAT') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 tabular-nums whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Merah{detailText ? ` · ${detailText}` : ' · Terlewat'}</span>
      </span>
    );
  }
  if (health === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 tabular-nums whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Kuning{detailText ? ` · ${detailText}` : ' · Warning'}</span>
      </span>
    );
  }
  if (health === 'AMAN') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Hijau{detailText ? ` · ${detailText}` : ' · Aman'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
      Selesai
    </span>
  );
}

export function SlotStatusText({ status }: { status: ReservationSlotStatus }) {
  if (status === 'CONFIRMED') return <span className="text-xs font-semibold text-emerald-700">Terkunci (TTE)</span>;
  if (status === 'LOCKED_PENDING') return <span className="text-xs font-semibold text-amber-700">Hold Sementara</span>;
  return <span className="text-xs font-medium text-slate-500">Dilepas</span>;
}
