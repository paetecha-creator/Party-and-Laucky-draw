import { useMemo, useState } from 'react';
import { Award, Gift, Lock, RefreshCw, Sparkles, Unlock, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  executeLuckyDraw,
  fetchCheckinPhoto,
  getEligibleEmployees,
} from '../lib/firestoreService';
import {
  Employee,
  EventConfig,
  Prize,
  ToastItem,
  Winner,
} from '../types/event';
import { GoogleSignInButton } from './GoogleSignInButton';

interface Props {
  config: EventConfig;
  employees: Employee[];
  prizes: Prize[];
  winners: Winner[];
  isAdminAuth: boolean;
  onGoogleSignIn: () => Promise<void>;
  onToast: (message: string, type?: ToastItem['type']) => void;
}

export function ExecutiveDrawView({
  config,
  employees,
  prizes,
  winners,
  isAdminAuth,
  onGoogleSignIn,
  onToast,
}: Props) {
  const [drawing, setDrawing] = useState(false);
  const [winnerModal, setWinnerModal] = useState<{
    winner: Winner;
    photoUrl: string;
  } | null>(null);

  const activePrize = useMemo(() => {
    if (config.activePrizeId) {
      const found = prizes.find((p) => p.id === config.activePrizeId);
      if (found) return found;
    }
    return prizes.find((p) => p.qty - p.drawn > 0) || null;
  }, [prizes, config.activePrizeId]);

  const totalRemaining = useMemo(
    () => prizes.reduce((sum, p) => sum + Math.max(0, p.qty - p.drawn), 0),
    [prizes]
  );

  const activeRemaining = activePrize
    ? Math.max(0, activePrize.qty - activePrize.drawn)
    : 0;

  const eligible = useMemo(
    () => getEligibleEmployees(employees, winners, config),
    [employees, winners, config]
  );

  const isReady =
    isAdminAuth &&
    !config.sysOpen &&
    config.execReady &&
    totalRemaining > 0 &&
    activeRemaining > 0 &&
    Boolean(activePrize);

  const handleDrawClick = async () => {
    if (!isReady || !activePrize || drawing) return;
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    setDrawing(true);
    try {
      const winner = await executeLuckyDraw(activePrize, eligible);
      const photoUrl = await fetchCheckinPhoto(winner.empId).catch(() => '');
      if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.6 },
      });
      setWinnerModal({ winner, photoUrl });
      onToast(`สุ่มได้ผู้โชคดี: ${winner.name}`, 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'ไม่สามารถสุ่มรางวัลได้',
        'error'
      );
    } finally {
      setDrawing(false);
    }
  };

  let buttonTitle = 'LOCKED';
  let buttonSub = 'รอสัญญาณปลดล็อกจาก Admin';
  let statusText = 'กรุณารอการเปิดสิทธิ์จากผู้ควบคุมเวที (Admin Console)';
  let statusColor = 'text-slate-400';

  if (!isAdminAuth) {
    buttonTitle = 'SIGN IN';
    buttonSub = 'กรุณายืนยันตัวตนผู้บริหาร';
    statusText = 'เชื่อมต่อบัญชี Google ที่ได้รับสิทธิ์ Admin เพื่อใช้งานปุ่มสุ่มรางวัล';
    statusColor = 'text-amber-300';
  } else if (drawing) {
    buttonTitle = 'DRAWING...';
    buttonSub = 'กำลังคัดเลือกผู้โชคดี';
    statusText = 'กำลังบันทึกผลการจับรางวัลและส่งสัญญาณขึ้นจอเวที...';
    statusColor = 'text-amber-300';
  } else if (totalRemaining <= 0 || activeRemaining <= 0) {
    buttonTitle = 'COMPLETED';
    buttonSub = 'ไม่มีของรางวัลคงเหลือ';
    statusText = 'ของรางวัลรายการนี้ถูกสุ่มครบเรียบร้อยแล้ว';
    statusColor = 'text-rose-400';
  } else if (config.sysOpen) {
    buttonTitle = 'REGIS OPEN';
    buttonSub = 'ระบบกำลังเปิดรับลงทะเบียน';
    statusText = 'จะสามารถกดสุ่มรางวัลได้หลังจาก Admin ปิดรับลงทะเบียนแล้ว';
    statusColor = 'text-amber-400';
  } else if (isReady) {
    buttonTitle = config.isRedrawActive ? 'REDRAW!' : 'PRESS TO DRAW';
    buttonSub = config.isRedrawActive ? 'สุ่มใหม่อีกครั้ง' : 'แตะเพื่อสุ่มผู้โชคดี';
    statusText = config.isRedrawActive
      ? 'เปิดสิทธิ์สุ่มใหม่เรียบร้อย! แตะปุ่มเพื่อสุ่มผู้โชคดีคนใหม่'
      : 'สัญญาณพร้อมแล้ว! แตะปุ่มเพื่อสุ่มผู้โชคดีบนเวที';
    statusColor = 'text-emerald-400';
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12 flex flex-col items-center text-center space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Executive Lucky Draw
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          ปุ่มกดสุ่มผู้โชคดีสำหรับผู้บริหารบนเวที · ผู้มีสิทธิ์ลุ้น {eligible.length.toLocaleString()} ท่าน
        </p>
      </div>

      {/* Active Prize Card */}
      <div className="w-full bg-[#111827] border border-slate-800 rounded-3xl p-5 flex items-center gap-4 text-left">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#090d16] border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
          {activePrize?.imageUrl ? (
            <img
              src={activePrize.imageUrl}
              alt={activePrize.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <Gift className="w-8 h-8 text-amber-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-indigo-300 font-semibold">
            รางวัลที่กำลังสุ่ม
          </div>
          <h2 className="text-base sm:text-xl font-bold text-white truncate mt-0.5">
            {activePrize ? activePrize.name : 'ยังไม่ได้เลือกรางวัล'}
          </h2>
          <p className="text-xs text-slate-400 font-mono-tabular mt-1">
            คงเหลือ {activeRemaining} / {activePrize?.qty ?? 0} รางวัล
          </p>
        </div>
      </div>

      {!isAdminAuth && (
        <div className="w-full bg-[#111827] border border-indigo-500/30 rounded-3xl p-6 space-y-4">
          <p className="text-sm text-slate-300">
            กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์ผู้ดูแลเพื่อเปิดใช้งานปุ่มสุ่มรางวัลบนอุปกรณ์นี้
          </p>
          <div className="flex justify-center">
            <GoogleSignInButton onClick={onGoogleSignIn} />
          </div>
        </div>
      )}

      {/* Giant Circular Executive Button */}
      <div className="py-2">
        <button
          type="button"
          disabled={!isReady || drawing}
          onClick={handleDrawClick}
          className={`w-60 h-60 sm:w-72 sm:h-72 rounded-full border-4 flex flex-col items-center justify-center p-6 transition-all duration-200 ${
            drawing
              ? 'bg-slate-900 border-amber-400 text-amber-300 cursor-wait'
              : isReady
                ? 'bg-gradient-to-tr from-amber-500 via-pink-600 to-indigo-600 border-amber-300 text-white shadow-[0_0_50px_rgba(236,72,153,0.45)] active:scale-95 cursor-pointer'
                : 'bg-[#111827] border-slate-700 text-slate-400 opacity-65 cursor-not-allowed'
          }`}
        >
          <div className="mb-3">
            {drawing ? (
              <RefreshCw className="w-10 h-10 animate-spin" />
            ) : isReady ? (
              <Sparkles className="w-10 h-10" />
            ) : isAdminAuth && !config.execReady ? (
              <Lock className="w-10 h-10" />
            ) : (
              <Unlock className="w-10 h-10" />
            )}
          </div>
          <span className="text-2xl sm:text-3xl font-black tracking-tight">
            {buttonTitle}
          </span>
          <span className="text-xs sm:text-sm font-medium opacity-90 mt-1">
            {buttonSub}
          </span>
        </button>
      </div>

      <p className={`text-xs sm:text-sm font-semibold ${statusColor}`}>
        {statusText}
      </p>

      {/* Winner Celebration Modal */}
      {winnerModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWinnerModal(null);
          }}
        >
          <div className="w-full max-w-md bg-[#111827] border border-amber-400/50 rounded-3xl p-6 text-center space-y-5 relative shadow-2xl">
            <button
              type="button"
              onClick={() => setWinnerModal(null)}
              aria-label="ปิดหน้าต่าง"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-300">
              <Award className="w-4 h-4" />
              <span>ผู้โชคดีรางวัล · {winnerModal.winner.prizeName}</span>
            </div>

            {winnerModal.photoUrl && (
              <div className="w-32 h-32 mx-auto rounded-2xl overflow-hidden border-2 border-amber-400/60">
                <img
                  src={winnerModal.photoUrl}
                  alt={winnerModal.winner.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs font-mono-tabular text-indigo-300">
                รหัส {winnerModal.winner.empId}
                {winnerModal.winner.inCharge
                  ? ` · ${winnerModal.winner.inCharge}`
                  : ''}
              </div>
              <h3 className="text-2xl font-black text-white">
                {winnerModal.winner.name}
              </h3>
              <p className="text-xs text-slate-400">
                {winnerModal.winner.pos || '-'}
              </p>
            </div>

            <div className="bg-[#090d16] border border-slate-800 rounded-2xl py-3 px-4">
              <div className="text-xs text-slate-400">หมายเลขโต๊ะ</div>
              <div className="text-2xl font-black text-amber-300 font-mono-tabular">
                {winnerModal.winner.table || '-'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWinnerModal(null)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white font-bold text-sm min-h-[46px]"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
