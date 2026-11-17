import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Taller sheet for forms. */
  tall?: boolean;
  /** Prevent closing by tapping the backdrop (e.g. while saving). */
  locked?: boolean;
}

/**
 * Mobile-first bottom sheet (centered dialog on wide screens).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  tall = false,
  locked = false,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !locked && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`awqaf-sheet w-full sm:max-w-lg bg-white rounded-t-[1.75rem] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
          tall ? 'h-[92dvh] sm:h-auto sm:max-h-[90dvh]' : 'max-h-[88dvh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2 flex justify-center shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-line" />
        </div>

        {(title || subtitle) && (
          <div className="px-4 sm:px-5 pt-2 sm:pt-4 pb-3 flex items-start gap-3 shrink-0 border-b border-line/70">
            <div className="flex-1 min-w-0">
              {title && <h2 className="text-lg font-extrabold text-ink leading-snug">{title}</h2>}
              {subtitle && <div className="text-sm text-muted mt-0.5">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={locked}
              aria-label="إغلاق"
              className="w-10 h-10 -me-1 rounded-full bg-sand text-muted flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-line/70 bg-white px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
