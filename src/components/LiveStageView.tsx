import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Gift,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  fetchCheckinPhoto,
  subscribeRecentCheckins,
} from '../lib/firestoreService';
import { playFanfareSound, playTickSound } from '../lib/sound';
import {
  CheckinPhoto,
  Employee,
  EventConfig,
  Prize,
  Winner,
} from '../types/event';

interface Props {
  config: EventConfig;
  employees: Employee[];
  prizes: Prize[];
  winners: Winner[];
}

export function LiveStageView({ config, employees, prizes, winners }: Props) {
  const [recentPhotos, setRecentPhotos] = useState<Record<string, CheckinPhoto>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rollingCandidate, setRollingCandidate] = useState<{
    name: string;
    inCharge: string;
    id: string;
  } | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [revealedWinner, setRevealedWinner] = useState<{
    empId: string;
    name: string;
    inCharge: string;
    pos: string;
    table: string;
    prizeName: string;
    prizeImage: string;
    photoUrl: string;
  } | null>(null);

  const lastDrawIdRef = useRef<string | null>(null);
  const rollingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeRecentCheckins(12, setRecentPhotos);
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const total = employees.length;
    const registered = employees.filter((e) => e.registered).length;
    const remaining = Math.max(0, total - registered);
    const percent = total > 0 ? Math.round((registered / total) * 100) : 0;
    return { total, registered, remaining, percent };
  }, [employees]);

  const recentCheckins = useMemo(() => {
    return employees
      .filter((e) => e.registered)
      .sort((a, b) => (b.regTimestamp || 0) - (a.regTimestamp || 0))
      .slice(0, 8);
  }, [employees]);

  const activePrize = useMemo(() => {
    if (config.activePrizeId) {
      const found = prizes.find((p) => p.id === config.activePrizeId);
      if (found) return found;
    }
    return prizes.find((p) => p.qty - p.drawn > 0) || prizes[0] || null;
  }, [prizes, config.activePrizeId]);

  const registeredPool = useMemo(
    () => employees.filter((e) => e.registered),
    [employees]
  );

  // Detect new draw event in real time from config.latestDrawId
  useEffect(() => {
    if (lastDrawIdRef.current === null) {
      lastDrawIdRef.current = config.latestDrawId || '';
      if (config.latestDrawId && config.latestWinnerEmpId) {
        fetchCheckinPhoto(config.latestWinnerEmpId)
          .then((photoUrl) => {
            setRevealedWinner({
              empId: config.latestWinnerEmpId,
              name: config.latestWinnerName,
              inCharge: config.latestWinnerInCharge,
              pos: config.latestWinnerPos,
              table: config.latestWinnerTable,
              prizeName: config.latestWinnerPrize,
              prizeImage: config.latestWinnerPrizeImage,
              photoUrl,
            });
          })
          .catch(() => {});
      }
      return;
    }

    if (!config.latestDrawId) {
      lastDrawIdRef.current = '';
      setRevealedWinner(null);
      return;
    }

    if (config.latestDrawId === lastDrawIdRef.current) return;
    lastDrawIdRef.current = config.latestDrawId;

    const targetWinner = {
      empId: config.latestWinnerEmpId,
      name: config.latestWinnerName,
      inCharge: config.latestWinnerInCharge,
      pos: config.latestWinnerPos,
      table: config.latestWinnerTable,
      prizeName: config.latestWinnerPrize,
      prizeImage: config.latestWinnerPrizeImage,
    };

    // Start 3.6s slot machine rolling animation
    if (rollingTimerRef.current) {
      window.clearTimeout(rollingTimerRef.current);
    }
    setIsRolling(true);
    setRevealedWinner(null);

    let winnerPhotoPromise = fetchCheckinPhoto(targetWinner.empId).catch(() => '');

    const pool =
      registeredPool.length > 0
        ? registeredPool
        : [
            {
              id: targetWinner.empId,
              fullName: targetWinner.name,
              inCharge: targetWinner.inCharge,
            } as Employee,
          ];

    let speed = 50;
    const duration = 3600;
    let elapsed = 0;
    let idx = 0;

    const step = () => {
      const candidate = pool[idx % pool.length];
      idx++;
      setRollingCandidate({
        name: candidate.fullName,
        inCharge: candidate.inCharge || '-',
        id: candidate.id,
      });
      if (soundEnabled) playTickSound();

      elapsed += speed;
      if (elapsed < duration) {
        if (elapsed > duration * 0.7) speed += 25;
        else if (elapsed > duration * 0.4) speed += 8;
        rollingTimerRef.current = window.setTimeout(step, speed);
      } else {
        setRollingCandidate({
          name: targetWinner.name,
          inCharge: targetWinner.inCharge || '-',
          id: targetWinner.empId,
        });
        if (soundEnabled) playFanfareSound();
        confetti({
          particleCount: 160,
          spread: 95,
          origin: { y: 0.55 },
        });
        rollingTimerRef.current = window.setTimeout(async () => {
          const photoUrl = await winnerPhotoPromise;
          setIsRolling(false);
          setRevealedWinner({ ...targetWinner, photoUrl });
        }, 650);
      }
    };

    step();

    return () => {
      if (rollingTimerRef.current) window.clearTimeout(rollingTimerRef.current);
    };
  }, [config.latestDrawId, registeredPool, soundEnabled]);

  // Clear winner card when executive button is unlocked for next draw
  useEffect(() => {
    if (config.execReady && !isRolling) {
      setRevealedWinner(null);
    }
  }, [config.execReady, isRolling]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10 space-y-6">
      {/* Stage Top Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {config.sysOpen ? 'หน้าจอลงทะเบียนเข้างานแบบเรียลไทม์' : 'เวทีจับรางวัล Lucky Draw'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {config.sysOpen
              ? 'Live Attendance Board · อัปเดตยอดผู้เข้าร่วมงานทันทีเมื่อพนักงานสแกนเช็คอิน'
              : `สุ่มผู้โชคดีจากผู้ลงทะเบียนทั้งหมด ${stats.registered.toLocaleString()} ท่าน · จับรางวัลแล้ว ${winners.length} รางวัล`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((s) => !s)}
          className="px-4 py-2 rounded-xl bg-[#111827] border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 transition min-h-[42px]"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>เปิดเสียงเวที</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" />
              <span>ปิดเสียงเวที</span>
            </>
          )}
        </button>
      </div>

      {/* Mode A: Registration Live Dashboard */}
      {config.sysOpen ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-400">พนักงานทั้งหมด</div>
              <div className="text-3xl sm:text-4xl font-black text-white font-mono-tabular mt-1">
                {stats.total.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#111827] border border-emerald-500/30 rounded-2xl p-5">
              <div className="text-xs text-emerald-400">เช็คอินเข้างานแล้ว</div>
              <div className="text-3xl sm:text-4xl font-black text-emerald-300 font-mono-tabular mt-1">
                {stats.registered.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-400">ยังไม่ลงทะเบียน</div>
              <div className="text-3xl sm:text-4xl font-black text-amber-300 font-mono-tabular mt-1">
                {stats.remaining.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#111827] border border-indigo-500/30 rounded-2xl p-5">
              <div className="text-xs text-indigo-300">ความคืบหน้า</div>
              <div className="text-3xl sm:text-4xl font-black text-indigo-300 font-mono-tabular mt-1">
                {stats.percent}%
              </div>
            </div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>ความคืบหน้าการลงทะเบียนหน้างาน</span>
              <span className="font-mono-tabular font-bold">
                {stats.registered.toLocaleString()} / {stats.total.toLocaleString()}
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full bg-[#090d16] overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                <span>ผู้เข้าร่วมงานที่เช็คอินล่าสุด</span>
              </h2>
              <span className="text-xs text-slate-400 font-mono-tabular">
                แสดง {recentCheckins.length} รายการล่าสุด
              </span>
            </div>

            {recentCheckins.length === 0 ? (
              <div className="py-14 text-center text-slate-500 text-sm">
                ยังไม่มีผู้ลงทะเบียนเข้างาน · เมื่อมีพนักงานสแกนเช็คอิน รายชื่อและรูปถ่ายจะปรากฏที่นี่ทันที
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentCheckins.map((emp) => {
                  const photo = recentPhotos[emp.id]?.photoDataUrl || '';
                  return (
                    <div
                      key={emp.id}
                      className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
                        {photo ? (
                          <img
                            src={photo}
                            alt={emp.fullName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white truncate">
                          {emp.fullName}
                        </div>
                        <div className="text-xs text-slate-400 font-mono-tabular truncate">
                          {emp.id} · โต๊ะ {emp.table || '-'}
                        </div>
                        <div className="text-[11px] text-emerald-400 font-mono-tabular mt-0.5">
                          #{emp.checkInOrder || '-'} · {emp.regTimeStr || 'เช็คอินแล้ว'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Mode B: Lucky Draw Stage */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Active Prize Spotlight */}
          <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Gift className="w-4 h-4" />
                <span>ของรางวัลรอบปัจจุบัน</span>
              </div>

              <div className="aspect-[4/3] rounded-2xl bg-[#090d16] border border-slate-800 overflow-hidden flex items-center justify-center">
                {activePrize?.imageUrl ? (
                  <img
                    src={activePrize.imageUrl}
                    alt={activePrize.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Gift className="w-16 h-16 text-amber-400" />
                )}
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                  {activePrize ? activePrize.name : 'ยังไม่ได้เลือกของรางวัล'}
                </h2>
                {activePrize && (
                  <p className="text-sm text-slate-400 font-mono-tabular mt-1.5">
                    คงเหลือ {Math.max(0, activePrize.qty - activePrize.drawn)} / {activePrize.qty} รางวัล
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between font-mono-tabular">
              <span>ผู้มีสิทธิ์ในงาน</span>
              <span className="text-emerald-400 font-bold">
                {stats.registered.toLocaleString()} ท่าน
              </span>
            </div>
          </div>

          {/* Center Stage: Waiting / Rolling / Winner */}
          <div className="lg:col-span-8 bg-[#111827] border border-indigo-500/30 rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center text-center min-h-[420px]">
            {isRolling && rollingCandidate ? (
              <div className="space-y-5 w-full max-w-xl">
                <div className="text-sm font-bold text-amber-300 tracking-wide">
                  กำลังสุ่มผู้โชคดี · {activePrize?.name || 'รางวัลพิเศษ'}
                </div>
                <div className="bg-[#090d16] border-2 border-pink-500/60 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-3">
                  <div className="text-sm font-mono-tabular text-indigo-300">
                    รหัส {rollingCandidate.id} · {rollingCandidate.inCharge}
                  </div>
                  <div className="text-3xl sm:text-5xl font-black text-white tracking-tight truncate">
                    {rollingCandidate.name}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  ลุ้นระทึก! ระบบกำลังคัดเลือกผู้โชคดีบนเวที...
                </p>
              </div>
            ) : revealedWinner ? (
              <div className="space-y-6 w-full max-w-2xl">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-amber-300">
                  <Award className="w-5 h-5" />
                  <span>ขอแสดงความยินดีกับผู้โชคดี · {revealedWinner.prizeName}</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 bg-[#090d16] border border-amber-400/40 rounded-3xl p-6 sm:p-8 text-left">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-slate-800 border-2 border-amber-400/50 shrink-0 flex items-center justify-center">
                    {revealedWinner.photoUrl ? (
                      <img
                        src={revealedWinner.photoUrl}
                        alt={revealedWinner.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-12 h-12 text-amber-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
                    <div className="text-xs sm:text-sm font-mono-tabular text-indigo-300 font-semibold">
                      รหัส {revealedWinner.empId}
                      {revealedWinner.inCharge ? ` · ${revealedWinner.inCharge}` : ''}
                    </div>
                    <h3 className="text-2xl sm:text-4xl font-black text-white leading-tight">
                      {revealedWinner.name}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {revealedWinner.pos || '-'}
                    </p>
                    <div className="pt-2">
                      <span className="inline-block text-lg sm:text-2xl font-black text-amber-300 font-mono-tabular">
                        หมายเลขโต๊ะ: {revealedWinner.table || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-lg">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${
                    config.execReady
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3
                  className={`text-2xl sm:text-3xl font-black ${
                    config.execReady ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {config.execReady
                    ? config.isRedrawActive
                      ? 'เปิดสิทธิ์สุ่มใหม่อีกครั้ง!'
                      : 'พร้อมแล้ว! รอผู้บริหารกดปุ่มสุ่มรางวัล'
                    : 'เตรียมพร้อมสำหรับการสุ่มรางวัล'}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {config.execReady
                    ? `สิทธิปุ่มผู้บริหารเปิดใช้งานแล้วสำหรับรางวัล "${activePrize?.name || '-'}"`
                    : 'ขอให้ทุกท่านเตรียมลุ้นผู้โชคดีคนต่อไปบนหน้าจอเวที Lucky Draw'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
