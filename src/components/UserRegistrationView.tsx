import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gift,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  SwitchCamera,
  Ticket,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  fetchCheckinPhoto,
  registerEmployeeSelfCheckin,
} from '../lib/firestoreService';
import { Employee, EventConfig, Prize, ToastItem, Winner } from '../types/event';

interface Props {
  mode: 'user' | 'lucky';
  onModeChange: (mode: 'user' | 'lucky') => void;
  config: EventConfig;
  employees: Employee[];
  prizes: Prize[];
  winners: Winner[];
  loadingData: boolean;
  onToast: (message: string, type?: ToastItem['type']) => void;
  onOpenAdmin: () => void;
}

function compressImageToDataUrl(
  source: HTMLVideoElement | HTMLImageElement,
  mirror = false
): string {
  const maxDim = 360;
  const sw =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) return '';

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (mirror) {
    ctx.translate(dw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.7);
}

export function UserRegistrationView({
  mode,
  onModeChange,
  config,
  employees,
  prizes,
  winners,
  loadingData,
  onToast,
  onOpenAdmin,
}: Props) {
  const [empQuery, setEmpQuery] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    emp: Employee;
    regTimeStr: string;
    checkInOrder: number;
    photoUrl: string;
  } | null>(null);
  const [existingPhoto, setExistingPhoto] = useState('');
  const [expandedPrizes, setExpandedPrizes] = useState<Record<string, boolean>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeFileInputRef = useRef<HTMLInputElement | null>(null);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id.toUpperCase(), e));
    return map;
  }, [employees]);

  const normalizedQuery = empQuery.trim().toUpperCase();

  const matchedEmployee = useMemo(() => {
    if (!normalizedQuery) return null;
    return employeeMap.get(normalizedQuery) ?? null;
  }, [employeeMap, normalizedQuery]);

  const quickSuggestions = useMemo(() => {
    if (!normalizedQuery || matchedEmployee || normalizedQuery.length < 2) {
      return [];
    }
    return employees
      .filter(
        (e) =>
          e.id.toUpperCase().includes(normalizedQuery) ||
          e.fullName.toUpperCase().includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [employees, matchedEmployee, normalizedQuery]);

  const registeredCount = useMemo(
    () => employees.filter((e) => e.registered).length,
    [employees]
  );

  // Fetch existing check-in photo when viewing an already-registered employee
  useEffect(() => {
    let active = true;
    if (matchedEmployee?.registered && matchedEmployee.hasPhoto) {
      fetchCheckinPhoto(matchedEmployee.id)
        .then((url) => {
          if (active) setExistingPhoto(url);
        })
        .catch(() => {
          if (active) setExistingPhoto('');
        });
    } else {
      setExistingPhoto('');
    }
    return () => {
      active = false;
    };
  }, [matchedEmployee]);

  // Camera lifecycle
  useEffect(() => {
    if (mode !== 'user' || !config.sysOpen || successInfo) {
      stopCamera();
      return;
    }
    startCamera(facingMode);
    return () => {
      stopCamera();
    };
  }, [mode, config.sysOpen, facingMode, successInfo]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setCameraError(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      setCameraError(true);
    }
  };

  const handleNativeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const compressed = compressImageToDataUrl(img, false);
        if (compressed) {
          setCapturedPhoto(compressed);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCapturePreview = () => {
    if (!videoRef.current || !cameraReady) return;
    const dataUrl = compressImageToDataUrl(videoRef.current, facingMode === 'user');
    if (dataUrl) {
      setCapturedPhoto(dataUrl);
    }
  };

  const handleConfirmRegistration = async () => {
    if (!matchedEmployee) {
      onToast('กรุณากรอกรหัสพนักงานให้ถูกต้องก่อนลงทะเบียน', 'warning');
      return;
    }
    if (matchedEmployee.registered) {
      onToast('พนักงานท่านนี้ได้ลงทะเบียนเข้างานเรียบร้อยแล้ว', 'info');
      return;
    }

    let photoToSave = capturedPhoto;
    if (!photoToSave && videoRef.current && cameraReady) {
      photoToSave = compressImageToDataUrl(videoRef.current, facingMode === 'user');
    }

    if (!photoToSave && !cameraError) {
      onToast('กรุณากดถ่ายรูปเซลฟี่ก่อนยืนยันลงทะเบียน', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const nextOrder = registeredCount + 1;
      const res = await registerEmployeeSelfCheckin(
        matchedEmployee,
        photoToSave,
        nextOrder
      );
      if (navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.65 },
      });
      setSuccessInfo({
        emp: { ...matchedEmployee, registered: true, regTimeStr: res.regTimeStr },
        regTimeStr: res.regTimeStr,
        checkInOrder: res.checkInOrder,
        photoUrl: photoToSave,
      });
      onToast(`ลงทะเบียนสำเร็จ · โต๊ะ ${matchedEmployee.table || '-'}`, 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียน',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetRegistration = () => {
    setSuccessInfo(null);
    setEmpQuery('');
    setCapturedPhoto('');
    setExistingPhoto('');
  };

  // Lucky draw summary stats
  const prizeStats = useMemo(() => {
    const totalQty = prizes.reduce((sum, p) => sum + p.qty, 0);
    const totalDrawn = prizes.reduce((sum, p) => sum + p.drawn, 0);
    const totalRemaining = Math.max(0, totalQty - totalDrawn);
    return { totalQty, totalDrawn, totalRemaining };
  }, [prizes]);

  const winnersByPrize = useMemo(() => {
    const map = new Map<string, Winner[]>();
    winners.forEach((w) => {
      const arr = map.get(w.prizeId) || [];
      arr.push(w);
      map.set(w.prizeId, arr);
    });
    return map;
  }, [winners]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-12">
      {/* Sub-navigation Segmented Control + Quick Stats Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {mode === 'user' ? 'ลงทะเบียนเข้าร่วมงาน' : 'ผลรางวัล Lucky Draw'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {mode === 'user'
              ? 'กรอกรหัสพนักงาน ตรวจสอบหมายเลขโต๊ะ และถ่ายภาพยืนยันการเข้างาน'
              : 'ติดตามผลผู้โชคดีและจำนวนของรางวัลคงเหลือแบบเรียลไทม์'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-xl shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onModeChange('user')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 min-h-[40px] ${
              mode === 'user'
                ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>ลงทะเบียน</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange('lucky')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 min-h-[40px] ${
              mode === 'lucky'
                ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>ผลรางวัล ({winners.length})</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Registration */}
      {mode === 'user' && (
        <>
          {!config.sysOpen ? (
            <div className="bg-[#111827] border border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">
                ระบบปิดรับลงทะเบียนชั่วคราว
              </h2>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                ขณะนี้ปิดรับการลงทะเบียนหน้างานแล้ว ท่านสามารถตรวจสอบผลรางวัล Lucky Draw
                หรือติดต่อเจ้าหน้าที่ประจำจุดลงทะเบียน
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onModeChange('lucky')}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition min-h-[44px]"
                >
                  ดูผลรางวัล Lucky Draw
                </button>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition min-h-[44px]"
                >
                  สำหรับเจ้าหน้าที่
                </button>
              </div>
            </div>
          ) : successInfo ? (
            /* Success Pass Card */
            <div className="bg-[#111827] border border-emerald-500/30 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto text-center space-y-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400 tracking-wide">
                  ลงทะเบียนเข้างานสำเร็จ · ลำดับที่ #{successInfo.checkInOrder}
                </p>
                <h2 className="text-2xl font-extrabold text-white mt-1">
                  {successInfo.emp.fullName}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  รหัส <span className="font-mono-tabular text-slate-200">{successInfo.emp.id}</span>
                  {successInfo.emp.inCharge ? ` · ${successInfo.emp.inCharge}` : ''}
                  {successInfo.emp.pos ? ` · ${successInfo.emp.pos}` : ''}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">หมายเลขโต๊ะที่นั่ง</div>
                  <div className="text-3xl font-black text-amber-300 font-mono-tabular mt-1">
                    {successInfo.emp.table || '-'}
                  </div>
                </div>
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">ลำดับการเข้างาน</div>
                  <div className="text-3xl font-black text-pink-400 font-mono-tabular mt-1">
                    #{successInfo.checkInOrder}
                  </div>
                </div>
              </div>

              {successInfo.photoUrl && (
                <div className="w-44 h-44 mx-auto rounded-2xl overflow-hidden border border-slate-700 bg-[#090d16]">
                  <img
                    src={successInfo.photoUrl}
                    alt={successInfo.emp.fullName}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <p className="text-xs text-slate-400 font-mono-tabular">
                เวลาลงทะเบียน: {successInfo.regTimeStr}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleResetRegistration}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white font-bold text-sm transition min-h-[48px]"
                >
                  ← กลับหน้าค้นหา / ลงทะเบียนท่านอื่น
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('lucky')}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition min-h-[48px]"
                >
                  ดูรายการรางวัล
                </button>
              </div>
            </div>
          ) : (
            /* Main Registration Split Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Search & Employee Pass */}
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
                {employees.length === 0 && !loadingData && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-3">
                    <span>ยังไม่มีข้อมูลพนักงานในระบบ กรุณานำเข้าจาก Google Sheets หรือไฟล์เริ่มต้น</span>
                    <button
                      type="button"
                      onClick={onOpenAdmin}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold shrink-0"
                    >
                      ตั้งค่าใน Admin
                    </button>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="empIdInput"
                    className="block text-xs font-semibold text-indigo-300 mb-2"
                  >
                    รหัสพนักงาน (Employee ID)
                  </label>
                  <div className="relative flex items-center">
                    <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
                    <input
                      id="empIdInput"
                      type="text"
                      value={empQuery}
                      onChange={(e) => {
                        setEmpQuery(e.target.value.toUpperCase());
                        setCapturedPhoto('');
                      }}
                      placeholder="เช่น ST20580, 7473, 15139"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="w-full bg-[#090d16] border border-slate-700 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 rounded-2xl py-3.5 pl-12 pr-11 text-lg sm:text-xl font-bold text-white placeholder-slate-500 tracking-wider font-mono-tabular outline-none transition"
                    />
                    {empQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmpQuery('');
                          setCapturedPhoto('');
                        }}
                        aria-label="ล้างรหัสพนักงาน"
                        className="absolute right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    พิมพ์รหัสพนักงานเพื่อตรวจสอบข้อมูลและหมายเลขโต๊ะทันที ({employees.length.toLocaleString()} รายชื่อในระบบ)
                  </p>
                </div>

                {/* Quick Suggestions */}
                {quickSuggestions.length > 0 && (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl bg-[#090d16] overflow-hidden">
                    {quickSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEmpQuery(item.id)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-800/60 transition flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {item.fullName}
                          </div>
                          <div className="text-xs text-slate-400">
                            <span className="font-mono-tabular text-indigo-300">{item.id}</span>
                            {item.inCharge ? ` · ${item.inCharge}` : ''}
                            {item.pos ? ` · ${item.pos}` : ''}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-amber-300 font-mono-tabular shrink-0">
                          โต๊ะ {item.table || '-'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Not Found Message */}
                {normalizedQuery.length >= 3 &&
                  !matchedEmployee &&
                  quickSuggestions.length === 0 && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
                      ไม่พบรหัสพนักงาน <span className="font-mono-tabular font-bold">{normalizedQuery}</span> ในระบบ
                    </div>
                  )}

                {/* Matched Employee Card */}
                {matchedEmployee && (
                  <div className="bg-[#090d16] border border-indigo-500/40 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-mono-tabular font-bold text-indigo-300">
                          รหัส {matchedEmployee.id}
                          {matchedEmployee.inCharge ? ` · ${matchedEmployee.inCharge}` : ''}
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
                          {matchedEmployee.fullName}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-400">
                          ตำแหน่ง: {matchedEmployee.pos || '-'}
                        </p>
                      </div>

                      <div className="text-center bg-indigo-500/15 border border-indigo-400/30 rounded-xl px-4 py-2 shrink-0">
                        <span className="text-[11px] block text-indigo-300">หมายเลขโต๊ะ</span>
                        <span className="text-2xl font-black text-amber-300 font-mono-tabular">
                          {matchedEmployee.table || '-'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {matchedEmployee.registered ? (
                        <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ลงทะเบียนแล้ว (ลำดับ #{matchedEmployee.checkInOrder || '-'})
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          พร้อมลงทะเบียนเข้างาน
                        </span>
                      )}
                      {matchedEmployee.regTimeStr && (
                        <span className="text-slate-400 font-mono-tabular">
                          {matchedEmployee.regTimeStr}
                        </span>
                      )}
                    </div>

                    {matchedEmployee.registered && existingPhoto && (
                      <div className="pt-2 flex items-center gap-3">
                        <img
                          src={existingPhoto}
                          alt={matchedEmployee.fullName}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-700"
                        />
                        <div className="text-xs text-slate-400">
                          ภาพถ่ายยืนยันการลงทะเบียนถูกบันทึกเรียบร้อยแล้ว
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Event Progress Summary */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-400" />
                    ลงทะเบียนแล้ว
                  </span>
                  <span className="font-mono-tabular text-slate-200 font-semibold">
                    {registeredCount.toLocaleString()} / {employees.length.toLocaleString()} ท่าน
                  </span>
                </div>
              </div>

              {/* Right Column: Camera & Confirmation CTA */}
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-pink-400" />
                    <span>ถ่ายรูปเซลฟี่ยืนยันเข้างาน</span>
                  </h2>
                  {cameraReady && !capturedPhoto && (
                    <button
                      type="button"
                      onClick={() =>
                        setFacingMode((prev) =>
                          prev === 'user' ? 'environment' : 'user'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>สลับกล้อง</span>
                    </button>
                  )}
                </div>

                <input
                  ref={nativeFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleNativeFileChange}
                  className="hidden"
                />

                <div className="relative bg-[#090d16] rounded-2xl overflow-hidden aspect-[4/3] border border-slate-800 flex items-center justify-center">
                  {capturedPhoto ? (
                    <>
                      <img
                        src={capturedPhoto}
                        alt="Selfie Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setCapturedPhoto('')}
                        className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black text-amber-300 border border-amber-400/30 text-xs font-semibold flex items-center gap-1.5 transition min-h-[36px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>ถ่ายใหม่</span>
                      </button>
                    </>
                  ) : cameraError ? (
                    <div className="p-6 text-center space-y-3">
                      <Camera className="w-10 h-10 text-slate-500 mx-auto" />
                      <div className="text-sm font-semibold text-slate-200">
                        เปิดกล้องมือถือหรือเลือกรูปภาพ
                      </div>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        แตะปุ่มด้านล่างเพื่อเปิดกล้องถ่ายรูปจากอุปกรณ์ของคุณโดยตรง
                      </p>
                      <button
                        type="button"
                        onClick={() => nativeFileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition min-h-[44px]"
                      >
                        เปิดกล้อง / เลือกรูปภาพ
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${
                          facingMode === 'user' ? 'scale-x-[-1]' : ''
                        }`}
                      />
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center border-2 border-dashed border-white/15 rounded-2xl m-3">
                        <div className="w-24 h-24 rounded-full border border-pink-400/40" />
                        <span className="mt-2 text-[11px] text-white/80 bg-black/55 px-2.5 py-0.5 rounded-md">
                          จัดใบหน้าให้อยู่ในกรอบ
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Camera Controls + Submit */}
                <div className="space-y-2.5">
                  {!capturedPhoto && cameraReady && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={handleCapturePreview}
                        className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold transition min-h-[44px]"
                      >
                        แคปภาพตัวอย่าง
                      </button>
                      <button
                        type="button"
                        onClick={() => nativeFileInputRef.current?.click()}
                        className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-medium transition min-h-[44px]"
                      >
                        อัปโหลดจากเครื่อง
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      submitting ||
                      !matchedEmployee ||
                      matchedEmployee.registered
                    }
                    onClick={handleConfirmRegistration}
                    className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-400 hover:via-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-pink-500/20 transition flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>กำลังบันทึกข้อมูล...</span>
                      </>
                    ) : matchedEmployee?.registered ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>ลงทะเบียนเข้างานแล้ว</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        <span>ถ่ายรูป &amp; ยืนยันการลงทะเบียน</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mode 2: Lucky Draw Results Board */}
      {mode === 'lucky' && (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-400">รางวัลทั้งหมด</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-indigo-300 font-mono-tabular mt-1">
                {prizeStats.totalQty}
              </div>
            </div>
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-400">จับไปแล้ว</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-pink-400 font-mono-tabular mt-1">
                {prizeStats.totalDrawn}
              </div>
            </div>
            <div className="bg-[#111827] border border-emerald-500/30 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-emerald-400">คงเหลือ</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono-tabular mt-1">
                {prizeStats.totalRemaining}
              </div>
            </div>
          </div>

          {/* Prizes Grid */}
          {prizes.length === 0 ? (
            <div className="bg-[#111827] border border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <Gift className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm text-slate-300 font-semibold">
                ยังไม่มีรายการของรางวัลในระบบ
              </p>
              <p className="text-xs text-slate-400">
                ผู้ดูแลระบบสามารถเพิ่มรายการของรางวัลได้จากเมนู Admin Console
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prizes.map((prize) => {
                const prizeWinners = winnersByPrize.get(prize.id) || [];
                const remaining = Math.max(0, prize.qty - prize.drawn);
                const isExpanded = Boolean(expandedPrizes[prize.id]);

                return (
                  <div
                    key={prize.id}
                    className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[#090d16] border border-slate-800 shrink-0 flex items-center justify-center relative">
                        {prize.imageUrl ? (
                          <img
                            src={prize.imageUrl}
                            alt={prize.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Gift className="w-7 h-7 text-amber-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-amber-300 font-mono-tabular font-semibold">
                          ลำดับรางวัล #{prize.order}
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white truncate mt-0.5">
                          {prize.name}
                        </h3>
                        <div className="text-xs text-slate-400 font-mono-tabular mt-1.5 flex flex-wrap items-center gap-x-2">
                          <span>ทั้งหมด {prize.qty}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-pink-300">จับแล้ว {prize.drawn}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              remaining > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                            }
                          >
                            คงเหลือ {remaining}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPrizes((prev) => ({
                          ...prev,
                          [prize.id]: !prev[prize.id],
                        }))
                      }
                      className="w-full py-2.5 px-3.5 rounded-xl bg-[#090d16] hover:bg-slate-800/80 border border-slate-800 text-xs font-semibold text-indigo-300 flex items-center justify-between transition min-h-[42px]"
                    >
                      <span className="flex items-center gap-2">
                        <Ticket className="w-4 h-4" />
                        <span>รายชื่อผู้ได้รับรางวัล ({prizeWinners.length} ท่าน)</span>
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-2 max-h-60 overflow-y-auto">
                        {prizeWinners.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-3">
                            ยังไม่มีผู้ได้รับรางวัลนี้ (รอสุ่มรางวัลบนเวที)
                          </p>
                        ) : (
                          prizeWinners.map((w, idx) => (
                            <div
                              key={w.id}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#090d16] border border-slate-800/80 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-white truncate">
                                  {idx + 1}. {w.name}
                                </div>
                                <div className="text-slate-400 font-mono-tabular">
                                  รหัส {w.empId}
                                  {w.inCharge ? ` · ${w.inCharge}` : ''}
                                </div>
                              </div>
                              <div className="text-amber-300 font-bold font-mono-tabular shrink-0">
                                โต๊ะ {w.table || '-'}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
