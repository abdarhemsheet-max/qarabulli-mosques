import type { GoogleMapsStatus } from '../../types/mosque';

export const GOOGLE_STATUS_LABEL: Record<GoogleMapsStatus, string> = {
  not_submitted: 'لم يُرسل لجوجل',
  submitted: 'بانتظار جوجل',
  live: 'ظاهر في جوجل',
};

const STYLE: Record<GoogleMapsStatus, string> = {
  not_submitted: 'bg-sand text-muted border-line',
  submitted: 'bg-amber-50 text-amber-800 border-amber-200',
  live: 'bg-brand-soft text-brand border-brand/20',
};

const DOT: Record<GoogleMapsStatus, string> = {
  not_submitted: 'bg-muted/50',
  submitted: 'bg-amber-500',
  live: 'bg-brand',
};

export function GoogleStatusBadge({ status }: { status: GoogleMapsStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] font-bold whitespace-nowrap ${STYLE[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[status]}`} />
      {GOOGLE_STATUS_LABEL[status]}
    </span>
  );
}
