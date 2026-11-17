import { AlertTriangle, X } from 'lucide-react';
import { ConfirmDialogState } from '../types/event';

interface Props {
  dialog: ConfirmDialogState;
  onClose: () => void;
}

export function ConfirmModal({ dialog, onClose }: Props) {
  if (!dialog.open) return null;

  const handleConfirm = async () => {
    await dialog.onConfirm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[#111827] border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                dialog.destructive
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'bg-indigo-500/15 text-indigo-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white leading-snug">
              {dialog.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
          {dialog.description}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition min-h-[44px]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-semibold transition min-h-[44px] ${
              dialog.destructive
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
