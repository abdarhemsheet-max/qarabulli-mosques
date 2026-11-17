import { useMemo, useState } from 'react';
import { Download, ImageOff, Map as MapIcon, Search, X } from 'lucide-react';
import type { MapStatus, MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { normalizeArabicName, timeAgoArabic } from '../lib/utils/geo';
import { exportMosquesToKml, exportMosquesToCsv } from '../lib/export/geoExport';
import { exportExcel } from '../lib/export/lazyExport';
import { MapStatusBadge } from '../components/ui/MapStatusBadge';
import { MosqueSheet } from '../components/MosqueSheet';
import { MosqueFormSheet } from '../components/MosqueFormSheet';
import { BottomSheet } from '../components/ui/BottomSheet';

interface ListPageProps {
  mosques: MosqueRecord[];
  currentUser: UserProfile;
  osmSettings: OsmSettings;
  loading: boolean;
  onShowOnMap: (mosque: MosqueRecord) => void;
}

type Filter = 'all' | 'mine' | 'no_photos' | MapStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'mine', label: 'توثيقاتي' },
  { id: 'none', label: 'غير منشور' },
  { id: 'linked', label: 'يحتاج تحديث' },
  { id: 'published', label: 'منشور' },
  { id: 'no_photos', label: 'بدون صور' },
];

export function ListPage({ mosques, currentUser, osmSettings, loading, onShowOnMap }: ListPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(currentUser.role === 'admin' ? 'all' : 'mine');
  const [locality, setLocality] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MosqueRecord | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const localities = useMemo(
    () => [...new Set(mosques.map((m) => m.locality.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')),
    [mosques]
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: mosques.length, mine: 0, no_photos: 0, none: 0, linked: 0, published: 0 };
    mosques.forEach((m) => {
      if (m.createdBy === currentUser.uid) c.mine += 1;
      if (m.photos.length === 0) c.no_photos += 1;
      c[m.mapStatus] += 1;
    });
    return c;
  }, [mosques, currentUser.uid]);

  const visible = useMemo(() => {
    const q = normalizeArabicName(query);
    return mosques.filter((m) => {
      if (filter === 'mine' && m.createdBy !== currentUser.uid) return false;
      if (filter === 'no_photos' && m.photos.length > 0) return false;
      if ((filter === 'none' || filter === 'linked' || filter === 'published') && m.mapStatus !== filter) return false;
      if (locality !== 'all' && m.locality.trim() !== locality) return false;
      if (q && !normalizeArabicName(`${m.officialName} ${m.commonName} ${m.landmark} ${m.createdByName}`).includes(q))
        return false;
      return true;
    });
  }, [mosques, filter, locality, query, currentUser.uid]);

  const selected = mosques.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky search + filters */}
      <div className="sticky top-0 z-10 bg-sand/95 backdrop-blur px-3 sm:px-5 pt-3 pb-2 space-y-2.5 border-b border-line/70">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الموثِّق"
              className="field pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="مسح"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setExportOpen(true)} className="btn-outline h-12 w-12 shrink-0" aria-label="تصدير">
            <Download className="w-5 h-5 text-brand" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? 'chip-on' : 'chip-off'}
            >
              {f.label}
              <span className={`text-xs tabular-nums ${filter === f.id ? 'text-white/80' : 'text-muted'}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {localities.length > 1 && (
          <select value={locality} onChange={(e) => setLocality(e.target.value)} className="field h-10 text-sm">
            <option value="all">كل المحلات</option>
            {localities.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Results */}
      <div className="px-3 sm:px-5 py-3 space-y-2.5 pb-6 max-w-3xl mx-auto">
        <p className="text-xs text-muted px-1 tabular-nums">{visible.length} مسجد</p>

        {loading && mosques.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-24 animate-pulse" />)
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-bold text-ink">لا توجد مساجد هنا</p>
            <p className="text-sm text-muted mt-1">
              {mosques.length === 0 ? 'ابدأ من الخريطة بزر «توثيق مسجد».' : 'جرّب تغيير البحث أو الفلتر.'}
            </p>
          </div>
        ) : (
          visible.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className="card w-full p-2.5 flex gap-3 text-right active:scale-[0.99] transition hover:border-brand/30"
            >
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-sand shrink-0 flex items-center justify-center">
                {m.photos[0] ? (
                  <img src={m.photos[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <ImageOff className="w-6 h-6 text-line" />
                )}
              </div>
              <div className="flex-1 min-w-0 py-0.5 space-y-1">
                <p className="font-extrabold text-ink leading-snug truncate">{m.officialName}</p>
                <p className="text-sm text-muted truncate">{m.locality}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <MapStatusBadge status={m.mapStatus} />
                  <span className="text-[11px] text-muted truncate">
                    {m.createdByName} · {timeAgoArabic(m.createdAt)}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {selected && !editing && (
        <MosqueSheet
          mosque={selected}
          currentUser={currentUser}
          osmSettings={osmSettings}
          onClose={() => setSelectedId(null)}
          onEdit={(m) => {
            setSelectedId(null);
            setEditing(m);
          }}
          onShowOnMap={(m) => {
            setSelectedId(null);
            onShowOnMap(m);
          }}
        />
      )}

      <MosqueFormSheet
        open={Boolean(editing)}
        position={editing ? { lat: editing.lat, lng: editing.lng, accuracy: editing.accuracy } : null}
        editing={editing}
        existingMosques={mosques}
        currentUser={currentUser}
        osmSettings={osmSettings}
        onClose={() => setEditing(null)}
        onChangeLocation={() => undefined}
        onEditExisting={(m) => {
          setEditing(null);
          setSelectedId(m.id);
        }}
        onAddAnother={() => setEditing(null)}
      />

      {exportOpen && (
        <BottomSheet open onClose={() => setExportOpen(false)} title="تصدير المساجد" subtitle={`${visible.length} مسجد حسب الفلتر الحالي`}>
          <div className="p-4 sm:p-5 space-y-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  void exportExcel(visible);
                  setExportOpen(false);
                }}
                disabled={visible.length === 0}
                className="btn-primary w-full h-14 text-base"
              >
                <Download className="w-5 h-5 text-gold" />
                ملف Excel (التقرير الرسمي)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                exportMosquesToKml(visible);
                setExportOpen(false);
              }}
              disabled={visible.length === 0}
              className="btn-outline w-full h-12 text-sm"
            >
              <MapIcon className="w-4 h-4 text-brand" />
              ملف KML (لأي تطبيق خرائط)
            </button>
            <button
              type="button"
              onClick={() => {
                exportMosquesToCsv(visible);
                setExportOpen(false);
              }}
              disabled={visible.length === 0}
              className="btn-outline w-full h-12 text-sm"
            >
              <Download className="w-4 h-4 text-brand" />
              ملف CSV
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
