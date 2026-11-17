import type { MapStatus } from '../../types/mosque';

export const MAP_STATUS_LABEL: Record<MapStatus, string> = {
  none: 'غير منشور في الخريطة',
  linked: 'في الخريطة — يحتاج تحديث',
  published: 'منشور في الخريطة',
};

const STYLE: Record<MapStatus, string> = {
  none: 'bg-sand text-muted border-line',
  linked: 'bg-amber-50 text-amber-800 border-amber-200',
  published: 'bg-brand-soft text-brand border-brand/20',
};

const DOT: Record<MapStatus, string> = {
  none: 'bg-muted/50',
  linked: 'bg-amber-500',
  published: 'bg-brand',
};

export function MapStatusBadge({ status }: { status: MapStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] font-bold whitespace-nowrap ${STYLE[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[status]}`} />
      {MAP_STATUS_LABEL[status]}
    </span>
  );
}
