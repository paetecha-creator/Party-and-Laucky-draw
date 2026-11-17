import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastItem } from '../types/event';

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md pointer-events-none"
    >
      {toasts.map((t) => {
        const iconMap = {
          success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
          warning: <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />,
          info: <Info className="w-4 h-4 text-indigo-400 shrink-0" />,
        };
        const borderMap = {
          success: 'border-emerald-500/40',
          error: 'border-rose-500/40',
          warning: 'border-amber-500/40',
          info: 'border-indigo-500/40',
        };

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#0f172a]/95 backdrop-blur-md border ${borderMap[t.type]} shadow-2xl text-sm text-slate-100`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {iconMap[t.type]}
              <span className="text-xs sm:text-sm font-medium leading-snug">
                {t.message}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="text-slate-400 hover:text-white p-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
