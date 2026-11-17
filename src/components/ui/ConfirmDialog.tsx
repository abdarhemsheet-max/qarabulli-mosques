import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1300] bg-black/45 flex items-center justify-center p-5"
      onClick={() => !busy && onCancel()}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="awqaf-sheet w-full max-w-sm card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div
          className={`w-12 h-12 rounded-2xl mb-3 flex items-center justify-center ${
            danger ? 'bg-red-50 text-red-700' : 'bg-gold-soft text-brand'
          }`}
        >
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
        <p className="text-sm text-muted mt-1 leading-relaxed">{message}</p>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-outline h-12">
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-12 ${danger ? 'btn bg-red-700 text-white hover:bg-red-800' : 'btn-primary'}`}
          >
            {busy ? 'جارٍ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
