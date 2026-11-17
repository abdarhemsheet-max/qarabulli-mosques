import { useEffect, useState } from 'react';
import { ExternalLink, MapPinPlus, Navigation } from 'lucide-react';
import type { OsmMosqueCandidate } from '../../types/mosque';
import { BottomSheet } from '../ui/BottomSheet';
import { fetchOsmTags, osmElementUrl } from '../../lib/osm/osmPublish';
import { formatDistance, generateDirectionsUrl } from '../../lib/utils/geo';

const TAG_LABELS: [string, string][] = [
  ['name:ar', 'الاسم بالعربية'],
  ['name', 'الاسم'],
  ['alt_name', 'اسم آخر'],
  ['old_name', 'الاسم القديم'],
  ['name:en', 'بالإنجليزية'],
  ['addr:street', 'الشارع'],
  ['addr:city', 'المدينة'],
  ['denomination', 'المذهب'],
  ['building', 'مبنى'],
  ['phone', 'الهاتف'],
  ['opening_hours', 'أوقات الفتح'],
  ['wheelchair', 'مناسب للكراسي المتحركة'],
  ['description', 'وصف'],
];

export function bestOsmName(c: OsmMosqueCandidate, tags?: Record<string, string> | null): string {
  const n = (tags?.['name:ar'] || tags?.name || c.nameAr || c.nameRaw || c.name || '').trim();
  return /^mosque$/i.test(n) || /بدون اسم/.test(n) ? '' : n;
}

interface OsmCandidateSheetProps {
  candidate: OsmMosqueCandidate;
  distanceMeters: number | null;
  onClose: () => void;
  onDocument: (candidate: OsmMosqueCandidate, name: string) => void;
}

export function OsmCandidateSheet({ candidate, distanceMeters, onClose, onDocument }: OsmCandidateSheetProps) {
  const [tags, setTags] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchOsmTags(candidate.osmId).then((t) => {
      if (!active) return;
      setTags(t);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [candidate.osmId]);

  const name = bestOsmName(candidate, tags);
  const rows = TAG_LABELS.filter(([k]) => tags?.[k]).map(([k, label]) => [label, tags![k]] as const);
  const url = osmElementUrl(candidate.osmId);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={name || 'مسجد بدون اسم'}
      subtitle={`موجود في الخريطة المفتوحة ولم يُوثَّق بعد${distanceMeters !== null ? ` · يبعد ${formatDistance(distanceMeters)}` : ''}`}
    >
      <div className="p-4 sm:p-5 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="rounded-2xl bg-sand border border-line p-3">
          <p className="text-xs font-bold text-muted mb-1.5">بيانات الخريطة المفتوحة (OpenStreetMap)</p>
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 rounded bg-line/60 animate-pulse w-2/3" />
              <div className="h-4 rounded bg-line/60 animate-pulse w-1/2" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink/75">لا توجد بيانات مسجّلة لهذا المسجد غير موقعه — وثّقه ليكتمل.</p>
          ) : (
            <dl className="divide-y divide-line/70">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1.5 text-sm">
                  <dt className="text-muted shrink-0">{label}</dt>
                  <dd className="font-bold text-ink text-left truncate">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <button type="button" onClick={() => onDocument(candidate, name)} className="btn-primary w-full h-14 text-base">
          <MapPinPlus className="w-5 h-5 text-gold" />
          وثّق هذا المسجد
        </button>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={generateDirectionsUrl(candidate.lat, candidate.lng, name)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline h-11 text-sm"
          >
            <Navigation className="w-4 h-4 text-brand" />
            الاتجاهات
          </a>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-outline h-11 text-sm">
              <ExternalLink className="w-4 h-4 text-brand" />
              في OpenStreetMap
            </a>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
