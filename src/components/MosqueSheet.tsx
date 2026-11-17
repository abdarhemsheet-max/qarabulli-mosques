import { useState } from 'react';
import { Move, Navigation, Pencil, Share2, Trash2, User, Clock, MapPin, Landmark, StickyNote, X } from 'lucide-react';
import type { MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { formatEnglishDateTime, generateDirectionsUrl } from '../lib/utils/geo';
import { deleteMosque } from '../lib/supabase/mosques';
import { BottomSheet } from './ui/BottomSheet';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { MapStatusBadge } from './ui/MapStatusBadge';
import { OsmPublishCard } from './OsmPublishCard';

interface MosqueSheetProps {
  mosque: MosqueRecord | null;
  currentUser: UserProfile;
  osmSettings: OsmSettings;
  onClose: () => void;
  onEdit: (mosque: MosqueRecord) => void;
  onMove?: (mosque: MosqueRecord) => void;
  onShowOnMap?: (mosque: MosqueRecord) => void;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5">
      <Icon className="w-4.5 h-4.5 text-muted shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm text-ink leading-relaxed">{value}</p>
      </div>
    </div>
  );
}

export function MosqueSheet({
  mosque,
  currentUser,
  osmSettings,
  onClose,
  onEdit,
  onMove,
  onShowOnMap,
}: MosqueSheetProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!mosque) return null;
  const canEdit = currentUser.role === 'admin' || mosque.createdBy === currentUser.uid;

  const share = async () => {
    const text = [
      mosque.officialName,
      mosque.commonName ? `(${mosque.commonName})` : '',
      `المحلة: ${mosque.locality}`,
      mosque.landmark ? `علامة دالة: ${mosque.landmark}` : '',
      mosque.mapsUrl,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (navigator.share) await navigator.share({ title: mosque.officialName, text });
      else await navigator.clipboard.writeText(text);
    } catch {
      // dismissed
    }
  };

  const remove = async () => {
    setDeleting(true);
    setErrorMsg('');
    try {
      await deleteMosque(mosque.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر الحذف.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={mosque.officialName}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span>{mosque.locality}</span>
            <MapStatusBadge status={mosque.mapStatus} />
          </span>
        }
      >
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          {mosque.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-5 pt-4">
              {mosque.photos.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhoto(p)}
                  className="shrink-0 w-40 h-28 rounded-2xl overflow-hidden bg-sand border border-line"
                >
                  <img src={p} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2 px-4 sm:px-5 pt-4">
            <a
              href={generateDirectionsUrl(mosque.lat, mosque.lng, mosque.officialName)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline flex-col h-16 text-xs gap-1"
            >
              <Navigation className="w-5 h-5 text-brand" />
              الاتجاهات
            </a>
            <button type="button" onClick={() => void share()} className="btn-outline flex-col h-16 text-xs gap-1">
              <Share2 className="w-5 h-5 text-brand" />
              مشاركة
            </button>
            {canEdit && (
              <button type="button" onClick={() => onEdit(mosque)} className="btn-outline flex-col h-16 text-xs gap-1">
                <Pencil className="w-5 h-5 text-brand" />
                تعديل
              </button>
            )}
            {canEdit && onMove ? (
              <button type="button" onClick={() => onMove(mosque)} className="btn-outline flex-col h-16 text-xs gap-1">
                <Move className="w-5 h-5 text-brand" />
                نقل الموقع
              </button>
            ) : onShowOnMap ? (
              <button type="button" onClick={() => onShowOnMap(mosque)} className="btn-outline flex-col h-16 text-xs gap-1">
                <MapPin className="w-5 h-5 text-brand" />
                على الخريطة
              </button>
            ) : null}
          </div>

          {errorMsg && (
            <p className="mx-4 sm:mx-5 mt-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">
              {errorMsg}
            </p>
          )}

          <div className="px-4 sm:px-5 pt-3 divide-y divide-line/70">
            <InfoRow icon={MapPin} label="الاسم المتداول" value={mosque.commonName} />
            <InfoRow icon={Landmark} label="علامة دالة" value={mosque.landmark} />
            <InfoRow icon={StickyNote} label="ملاحظات" value={mosque.notes} />
            <InfoRow icon={User} label="الموثِّق" value={mosque.createdByName} />
            <InfoRow
              icon={Clock}
              label="تاريخ التوثيق"
              value={`${formatEnglishDateTime(mosque.createdAt)}${
                mosque.updatedAt && mosque.createdAt && mosque.updatedAt.getTime() - mosque.createdAt.getTime() > 60000
                  ? ` · آخر تعديل ${formatEnglishDateTime(mosque.updatedAt)}`
                  : ''
              }`}
            />
            <div className="py-2.5 text-xs text-muted tabular-nums" dir="ltr">
              {mosque.lat.toFixed(6)}, {mosque.lng.toFixed(6)} · ±{mosque.accuracy}m
            </div>
          </div>

          <div className="px-4 sm:px-5 pt-2 space-y-3">
            <OsmPublishCard mosque={mosque} currentUser={currentUser} osmSettings={osmSettings} />

            {canEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full h-11 text-sm font-bold text-red-700 flex items-center justify-center gap-1.5 rounded-xl hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                حذف المسجد
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {photo && (
        <div className="fixed inset-0 z-[1400] bg-black/90 flex items-center justify-center p-3" onClick={() => setPhoto(null)}>
          <img src={photo} alt="" className="max-w-full max-h-full rounded-xl" />
          <button
            type="button"
            aria-label="إغلاق"
            className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="حذف المسجد؟"
        message={`سيُحذف «${mosque.officialName}» وصوره نهائياً من المنظومة ولا يمكن استرجاعه.`}
        confirmLabel="حذف نهائي"
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
