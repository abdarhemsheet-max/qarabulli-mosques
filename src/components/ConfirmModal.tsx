import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-white border border-[#E5E2D9] rounded-2xl p-5 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${
              danger ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A2421]">{title}</h2>
            <p className="text-sm text-[#4A5552] mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 min-h-[44px] rounded-xl border border-[#D8D4C8] text-[#1A2421] font-semibold text-sm hover:bg-[#FAF8F4] transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 min-h-[44px] rounded-xl text-white font-semibold text-sm transition ${
              danger
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-[#0F4C3A] hover:bg-[#0B3A2C]'
            } disabled:opacity-60`}
          >
            {loading ? 'جاري التنفيذ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
