import React, { useMemo, useState } from 'react';
import {
  Award,
  Camera,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Gift,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  deletePrize,
  ensureEventConfigExists,
  executeLuckyDraw,
  fetchCheckinPhoto,
  getEligibleEmployees,
  importEmployeesBatch,
  redrawLatestWinner,
  resetAllLuckyDraws,
  savePrize,
  seedSamplePrizes,
  toggleEmployeeRegistrationAdmin,
  updateEventConfig,
} from '../lib/firestoreService';
import {
  downloadEmployeeTemplateExcel,
  downloadWinnersExcelFile,
  extractSpreadsheetId,
  fetchSheetValues,
  fetchSpreadsheetMetadata,
  parseCsvTextToEmployees,
  parseEmployeeRows,
  parseWorkbookBufferToEmployees,
  SpreadsheetMetadata,
} from '../lib/sheets';
import {
  ConfirmDialogState,
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
  userEmail: string | null;
  sheetsAccessToken: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onToast: (message: string, type?: ToastItem['type']) => void;
  onConfirm: (dialog: Omit<ConfirmDialogState, 'open'>) => void;
  onNavigate: (route: 'user' | 'live' | 'exec') => void;
}

type AdminTab = 'regis' | 'prizes' | 'lucky';

export function AdminConsoleView({
  config,
  employees,
  prizes,
  winners,
  isAdminAuth,
  userEmail,
  sheetsAccessToken,
  onGoogleSignIn,
  onGoogleSignOut,
  onToast,
  onConfirm,
  onNavigate,
}: Props) {
  // Admin PIN lock layer (familiar 6-digit passcode: 236248 Super / 212224 Staff)
  const [unlockedRole, setUnlockedRole] = useState<'super' | 'staff' | null>(() => {
    const saved = sessionStorage.getItem('admin_role');
    return saved === 'super' || saved === 'staff' ? saved : null;
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinShake, setPinShake] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('regis');

  // Google Sheets sync state
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [sheetMeta, setSheetMeta] = useState<SpreadsheetMetadata | null>(null);
  const [selectedSheetTitle, setSelectedSheetTitle] = useState('');
  const [sheetPreviewEmployees, setSheetPreviewEmployees] = useState<Employee[] | null>(null);
  const [preserveExistingReg, setPreserveExistingReg] = useState(true);
  const [busySheets, setBusySheets] = useState(false);
  const [busyImport, setBusyImport] = useState(false);

  // Registration table filters & selfie modal
  const [searchRegis, setSearchRegis] = useState('');
  const [filterRegisStatus, setFilterRegisStatus] = useState<'all' | 'registered' | 'pending'>('all');
  const [filterRegisProbation, setFilterRegisProbation] = useState<'all' | 'probation' | 'regular'>('all');
  const [photoPreviewModal, setPhotoPreviewModal] = useState<{
    name: string;
    empId: string;
    url: string;
  } | null>(null);

  // Prize modal state
  const [prizeModalOpen, setPrizeModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<Prize | null>(null);
  const [prizeName, setPrizeName] = useState('');
  const [prizeQty, setPrizeQty] = useState(1);
  const [prizeOrder, setPrizeOrder] = useState(1);
  const [prizeImage, setPrizeImage] = useState('');
  const [savingPrize, setSavingPrize] = useState(false);

  // Block security 8-digit PIN (25102612)
  const [blockSectionUnlocked, setBlockSectionUnlocked] = useState(false);
  const [blockPinModalOpen, setBlockPinModalOpen] = useState(false);
  const [blockPinInput, setBlockPinInput] = useState('');
  const [blockPinError, setBlockPinError] = useState('');
  const [searchBlock, setSearchBlock] = useState('');
  const [filterBlockPos, setFilterBlockPos] = useState('all');
  const [filterBlockStatus, setFilterBlockStatus] = useState<'all' | 'blocked' | 'unblocked'>('all');

  const isSuperAdmin = unlockedRole === 'super';

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id.toUpperCase(), e));
    return map;
  }, [employees]);

  const stats = useMemo(() => {
    const total = employees.length;
    const registered = employees.filter((e) => e.registered).length;
    const remaining = Math.max(0, total - registered);
    const probation = employees.filter((e) => e.isProbation).length;
    const percent = total > 0 ? Math.round((registered / total) * 100) : 0;
    return { total, registered, remaining, probation, percent };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchRegis.trim().toLowerCase();
    return employees.filter((emp) => {
      const matchQ =
        !q ||
        emp.id.toLowerCase().includes(q) ||
        emp.fullName.toLowerCase().includes(q) ||
        emp.inCharge.toLowerCase().includes(q) ||
        emp.pos.toLowerCase().includes(q) ||
        emp.table.toLowerCase().includes(q);
      const matchStatus =
        filterRegisStatus === 'all' ||
        (filterRegisStatus === 'registered' ? emp.registered : !emp.registered);
      const matchProb =
        filterRegisProbation === 'all' ||
        (filterRegisProbation === 'probation' ? emp.isProbation : !emp.isProbation);
      return matchQ && matchStatus && matchProb;
    });
  }, [employees, searchRegis, filterRegisStatus, filterRegisProbation]);

  const distinctPositions = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach((e) => {
      const p = e.pos.trim();
      if (!p) return;
      counts.set(p, (counts.get(p) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

  const activePrize = useMemo(() => {
    if (config.activePrizeId) {
      const found = prizes.find((p) => p.id === config.activePrizeId);
      if (found) return found;
    }
    return prizes.find((p) => p.qty - p.drawn > 0) || prizes[0] || null;
  }, [prizes, config.activePrizeId]);

  const eligibleEmployees = useMemo(
    () => getEligibleEmployees(employees, winners, config),
    [employees, winners, config]
  );

  // PIN Pad Handlers
  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 6) return;
    const next = pinInput + digit;
    setPinInput(next);
    setPinError('');
    if (next.length === 6) {
      setTimeout(() => verifyAdminPin(next), 120);
    }
  };

  const verifyAdminPin = (code = pinInput) => {
    if (code === '236248' || code === '212224') {
      const role = code === '236248' ? 'super' : 'staff';
      sessionStorage.setItem('admin_role', role);
      setUnlockedRole(role);
      setPinInput('');
      setPinError('');
      if (isAdminAuth) {
        ensureEventConfigExists().catch(() => {});
      }
      onToast(
        role === 'super'
          ? 'เข้าสู่ระบบ Super Admin สำเร็จ'
          : 'เข้าสู่ระบบ Admin สำเร็จ',
        'success'
      );
    } else {
      setPinError('รหัสผ่าน 6 หลักไม่ถูกต้อง');
      setPinShake(true);
      setTimeout(() => {
        setPinShake(false);
        setPinInput('');
      }, 450);
    }
  };

  const handleBlockPinDigit = (digit: string) => {
    if (blockPinInput.length >= 8) return;
    const next = blockPinInput + digit;
    setBlockPinInput(next);
    setBlockPinError('');
    if (next.length === 8) {
      setTimeout(() => {
        if (next === '25102612') {
          setBlockSectionUnlocked(true);
          setBlockPinModalOpen(false);
          setBlockPinInput('');
          onToast('ปลดล็อกเมนูจัดการสิทธิ์ Lucky Draw เรียบร้อย', 'success');
        } else {
          setBlockPinError('รหัส PIN 8 หลักไม่ถูกต้อง');
          setTimeout(() => setBlockPinInput(''), 400);
        }
      }, 120);
    }
  };

  // Google Sheets Sync Handlers
  const handleLoadSpreadsheetTabs = async () => {
    if (!sheetsAccessToken) {
      onToast('กรุณาเชื่อมต่อ Google Sign-In ก่อนอ่านข้อมูล Google Sheets', 'warning');
      return;
    }
    const id = extractSpreadsheetId(sheetUrlInput);
    if (!id) {
      onToast('กรุณาระบุลิงก์หรือ Spreadsheet ID ของ Google Sheets', 'warning');
      return;
    }
    setBusySheets(true);
    setSheetPreviewEmployees(null);
    try {
      const meta = await fetchSpreadsheetMetadata(id, sheetsAccessToken);
      setSheetMeta(meta);
      if (meta.sheets.length > 0) {
        setSelectedSheetTitle(meta.sheets[0].title);
      }
      onToast(`พบไฟล์ "${meta.title}" (${meta.sheets.length} แท็บ)`, 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อ Google Sheets ได้',
        'error'
      );
    } finally {
      setBusySheets(false);
    }
  };

  const handlePreviewSheetData = async () => {
    if (!sheetsAccessToken || !sheetMeta || !selectedSheetTitle) return;
    setBusySheets(true);
    try {
      const rows = await fetchSheetValues(
        sheetMeta.spreadsheetId,
        selectedSheetTitle,
        sheetsAccessToken
      );
      const parsed = parseEmployeeRows(rows);
      if (parsed.length === 0) {
        onToast('ไม่พบข้อมูลพนักงานในแท็บที่เลือก', 'warning');
      } else {
        setSheetPreviewEmployees(parsed);
        onToast(`อ่านข้อมูลสำเร็จ พบ ${parsed.length} รายชื่อ`, 'success');
      }
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'ไม่สามารถอ่านข้อมูลจากแท็บนี้ได้',
        'error'
      );
    } finally {
      setBusySheets(false);
    }
  };

  const handleConfirmSyncToFirestore = (
    list: Employee[],
    sourceLabel: string
  ) => {
    if (!isAdminAuth) {
      onToast('กรุณา Sign in with Google ด้วยบัญชีผู้ดูแลระบบก่อนนำเข้าข้อมูล', 'warning');
      return;
    }
    onConfirm({
      title: `ยืนยันนำเข้าข้อมูลสู่ Firestore (${list.length.toLocaleString()} รายชื่อ)`,
      description: `แหล่งข้อมูล: ${sourceLabel}\n\n• ระบบจะซิงค์ข้อมูลพนักงาน แผนก ตำแหน่ง เลขโต๊ะ และวันเริ่มงานเข้าสู่ Firestore\n• คำนวณสถานะทดลองงาน (< 120 วัน) อัตโนมัติ\n• ${
        preserveExistingReg
          ? 'รักษาสถานะและเวลาเช็คอินเดิมของพนักงานที่ลงทะเบียนไปแล้ว'
          : 'เขียนทับสถานะการลงทะเบียนตามข้อมูลต้นทางทั้งหมด'
      }`,
      confirmLabel: `นำเข้า ${list.length.toLocaleString()} รายชื่อ`,
      onConfirm: async () => {
        setBusyImport(true);
        try {
          await ensureEventConfigExists();
          const count = await importEmployeesBatch(
            list,
            employeeMap,
            preserveExistingReg
          );
          setSheetPreviewEmployees(null);
          onToast(`ซิงค์ข้อมูลเข้าสู่ Firestore สำเร็จ ${count.toLocaleString()} รายชื่อ`, 'success');
        } catch (err) {
          onToast(
            err instanceof Error ? err.message : 'นำเข้าข้อมูลไม่สำเร็จ',
            'error'
          );
        } finally {
          setBusyImport(false);
        }
      },
    });
  };

  const handleImportInitialDataset = async () => {
    setBusyImport(true);
    try {
      const res = await fetch('/assets/aistudio/Lucky_draw_wow_05744e94');
      if (!res.ok) throw new Error('ไม่พบไฟล์ข้อมูลเริ่มต้น');
      const text = await res.text();
      const parsed = parseCsvTextToEmployees(text);
      if (parsed.length === 0) throw new Error('ไฟล์ข้อมูลเริ่มต้นไม่มีรายชื่อ');
      setBusyImport(false);
      handleConfirmSyncToFirestore(
        parsed,
        'ฐานข้อมูลเริ่มต้น (Lucky_draw_wow_05744e94)'
      );
    } catch (err) {
      setBusyImport(false);
      onToast(
        err instanceof Error ? err.message : 'โหลดชุดข้อมูลเริ่มต้นไม่สำเร็จ',
        'error'
      );
    }
  };

  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const parsed = parseWorkbookBufferToEmployees(buffer);
        if (parsed.length === 0) {
          onToast('ไม่พบข้อมูลพนักงานในไฟล์ที่อัปโหลด', 'warning');
          return;
        }
        handleConfirmSyncToFirestore(parsed, `ไฟล์ ${file.name}`);
      } catch (err) {
        onToast(
          err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ',
          'error'
        );
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleViewEmployeePhoto = async (emp: Employee) => {
    try {
      const url = await fetchCheckinPhoto(emp.id);
      if (!url) {
        onToast('ไม่พบรูปถ่ายของพนักงานท่านนี้', 'info');
        return;
      }
      setPhotoPreviewModal({ name: emp.fullName, empId: emp.id, url });
    } catch {
      onToast('โหลดรูปถ่ายไม่สำเร็จ', 'error');
    }
  };

  // Prize CRUD
  const openNewPrizeModal = () => {
    setEditingPrize(null);
    setPrizeName('');
    setPrizeQty(1);
    setPrizeOrder(prizes.length + 1);
    setPrizeImage('');
    setPrizeModalOpen(true);
  };

  const openEditPrizeModal = (p: Prize) => {
    setEditingPrize(p);
    setPrizeName(p.name);
    setPrizeQty(p.qty);
    setPrizeOrder(p.order);
    setPrizeImage(p.imageUrl);
    setPrizeModalOpen(true);
  };

  const handleSavePrizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeName.trim()) return;
    setSavingPrize(true);
    try {
      await savePrize({
        id: editingPrize?.id,
        name: prizeName,
        qty: prizeQty,
        drawn: editingPrize?.drawn ?? 0,
        order: prizeOrder,
        imageUrl: prizeImage,
      });
      setPrizeModalOpen(false);
      onToast(
        editingPrize ? 'อัปเดตของรางวัลสำเร็จ' : 'เพิ่มของรางวัลใหม่สำเร็จ',
        'success'
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'บันทึกของรางวัลไม่สำเร็จ',
        'error'
      );
    } finally {
      setSavingPrize(false);
    }
  };

  const handleAdminDrawNow = async () => {
    if (!activePrize) {
      onToast('กรุณาเพิ่มหรือเลือกของรางวัลก่อนสุ่ม', 'warning');
      return;
    }
    try {
      const winner = await executeLuckyDraw(activePrize, eligibleEmployees);
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.65 } });
      onToast(
        `ผู้โชคดี: ${winner.name} (${winner.empId}) · โต๊ะ ${winner.table || '-'}`,
        'success'
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'ไม่สามารถสุ่มรางวัลได้',
        'error'
      );
    }
  };

  const handleCopyExecUrl = async () => {
    const url = `${window.location.origin}/?page=exec`;
    try {
      await navigator.clipboard.writeText(url);
      onToast('คัดลอกลิงก์ผู้บริหารเรียบร้อย', 'success');
    } catch {
      onToast(url, 'info');
    }
  };

  // --- Gate 1: Must Authenticate with Google Admin ---
  // --- Gate 2: Familiar 6-digit PIN Passcode ---
  if (!isAdminAuth || !unlockedRole) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4 pb-24">
        <div
          className={`w-full max-w-sm bg-[#111827] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center ${
            pinShake ? 'shake-pad' : ''
          }`}
        >
          <div className="space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">Administrator Console</h1>
            <p className="text-xs text-slate-400">
              {!isAdminAuth
                ? 'เชื่อมต่อบัญชี Google ผู้ดูแลเพื่อเปิดสิทธิ์จัดการฐานข้อมูลและ Google Sheets'
                : 'กรอกรหัส PIN 6 หลัก (Super Admin: 236248 · Staff: 212224)'}
            </p>
          </div>

          {!isAdminAuth ? (
            <div className="space-y-4 pt-1">
              <div className="flex justify-center">
                <GoogleSignInButton onClick={onGoogleSignIn} />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ใช้บัญชี Google ที่ได้รับสิทธิ์ผู้ดูแลระบบเพื่อเข้าถึงการซิงค์ Google Sheets และการตั้งค่า Firestore
              </p>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-2">
                <span className="truncate">ยืนยันตัวตนแล้ว: {userEmail}</span>
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="text-slate-400 hover:text-white underline shrink-0"
                >
                  สลับบัญชี
                </button>
              </div>

              {/* 6-digit PIN Dots */}
              <div className="flex items-center justify-center gap-3 py-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      idx < pinInput.length
                        ? 'bg-pink-500 border-pink-400 scale-110'
                        : 'bg-[#090d16] border-slate-600'
                    }`}
                  />
                ))}
              </div>

              {pinError && (
                <p className="text-xs font-semibold text-rose-400">{pinError}</p>
              )}

              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto select-none">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handlePinDigit(d)}
                    className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-xl font-bold text-white active:scale-95 transition"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError('');
                  }}
                  className="h-12 rounded-2xl bg-[#090d16] hover:bg-slate-800 border border-slate-800 text-xs font-bold text-rose-400 transition"
                >
                  ล้าง
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit('0')}
                  className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-xl font-bold text-white active:scale-95 transition"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((p) => p.slice(0, -1))}
                  className="h-12 rounded-2xl bg-[#090d16] hover:bg-slate-800 border border-slate-800 text-sm font-bold text-amber-400 transition"
                >
                  ⌫
                </button>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => verifyAdminPin()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white font-bold text-sm min-h-[44px]"
                >
                  เข้าสู่ระบบ Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('admin_role', 'super');
                    setUnlockedRole('super');
                    ensureEventConfigExists().catch(() => {});
                  }}
                  className="w-full py-2 text-xs text-indigo-300 hover:text-white transition"
                >
                  เข้าใช้งานทันทีในฐานะบัญชีผู้ดูแล ({userEmail})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-12 space-y-6">
      {/* Admin Top Header Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white">
              Admin Console
            </h1>
            <span className="text-xs font-semibold text-indigo-300 font-mono-tabular">
              {isSuperAdmin ? 'Super Admin' : 'Staff Admin'} · {userEmail}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            จัดการฐานข้อมูลพนักงาน ซิงค์ Google Sheets ควบคุมการลงทะเบียน และเวที Lucky Draw แบบเรียลไทม์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('exec')}
            className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/30 text-xs font-semibold transition whitespace-nowrap min-h-[40px]"
          >
            หน้าผู้บริหาร
          </button>
          <button
            type="button"
            onClick={() => onNavigate('live')}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 text-xs font-semibold transition whitespace-nowrap min-h-[40px]"
          >
            หน้าจอ Live เวที
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('admin_role');
              setUnlockedRole(null);
              onGoogleSignOut();
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap min-h-[40px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#111827] border border-slate-800 rounded-2xl w-full sm:w-auto sm:inline-flex overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('regis')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 flex items-center justify-center gap-2 min-h-[42px] ${
            activeTab === 'regis'
              ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>การลงทะเบียน &amp; ซิงค์ข้อมูล</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('prizes')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 flex items-center justify-center gap-2 min-h-[42px] ${
            activeTab === 'prizes'
              ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>ของรางวัล ({prizes.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lucky')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap shrink-0 flex items-center justify-center gap-2 min-h-[42px] ${
            activeTab === 'lucky'
              ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>ควบคุม Lucky Draw</span>
        </button>
      </div>

      {/* TAB 1: Registration, Google Sheets Sync & Employee Table */}
      {activeTab === 'regis' && (
        <div className="space-y-6">
          {/* System Control & Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="text-base font-bold text-white">
                    ควบคุมระบบลงทะเบียน
                  </h2>
                  <span
                    className={`text-xs font-bold ${
                      config.sysOpen ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {config.sysOpen ? 'กำลังเปิดรับ' : 'ปิดรับชั่วคราว'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  เปิดหรือปิดหน้าลงทะเบียนผู้เข้าร่วมงานแบบเรียลไทม์ (ต้องปิดรับลงทะเบียนก่อนเริ่มสุ่มรางวัลบนเวที)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateEventConfig({ sysOpen: true })
                      .then(() => onToast('เปิดรับลงทะเบียนเรียบร้อย', 'success'))
                      .catch((e) => onToast(e.message, 'error'))
                  }
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition min-h-[44px] ${
                    config.sysOpen
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-emerald-600/80 text-slate-200'
                  }`}
                >
                  เปิดรับลงทะเบียน
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateEventConfig({ sysOpen: false })
                      .then(() => onToast('ปิดรับลงทะเบียนเรียบร้อย', 'info'))
                      .catch((e) => onToast(e.message, 'error'))
                  }
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition min-h-[44px] ${
                    !config.sysOpen
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 hover:bg-rose-600/80 text-slate-200'
                  }`}
                >
                  ปิดรับลงทะเบียน
                </button>
              </div>
            </div>

            <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">พนักงานทั้งหมด</div>
                  <div className="text-2xl font-black text-white font-mono-tabular mt-1">
                    {stats.total.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#090d16] border border-emerald-500/30 rounded-2xl p-4">
                  <div className="text-xs text-emerald-400">ลงทะเบียนแล้ว</div>
                  <div className="text-2xl font-black text-emerald-300 font-mono-tabular mt-1">
                    {stats.registered.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">คงเหลือ</div>
                  <div className="text-2xl font-black text-amber-300 font-mono-tabular mt-1">
                    {stats.remaining.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">ทดลองงาน (&lt;120 วัน)</div>
                  <div className="text-2xl font-black text-indigo-300 font-mono-tabular mt-1">
                    {stats.probation.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>อัตราการเข้างาน</span>
                  <span className="font-mono-tabular text-white font-bold">
                    {stats.percent}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#090d16] border border-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${stats.percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Google Sheets -> Firestore Sync + Initial Dataset / Excel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#111827] border border-indigo-500/30 rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    <span>เชื่อมโยงข้อมูลจาก Google Sheets สู่ Firestore</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    วางลิงก์ Google Sheet หรือ Spreadsheet ID เพื่อดึงรายชื่อพนักงานเข้าสู่ฐานข้อมูล Firestore
                  </p>
                </div>
                {!sheetsAccessToken && (
                  <GoogleSignInButton
                    onClick={onGoogleSignIn}
                    label="เชื่อมต่อ Google Sheets"
                  />
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 outline-none"
                />
                <button
                  type="button"
                  disabled={busySheets || !sheetsAccessToken}
                  onClick={handleLoadSpreadsheetTabs}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[44px]"
                >
                  {busySheets ? 'กำลังโหลด...' : 'ดึงแท็บข้อมูล'}
                </button>
              </div>

              {sheetMeta && (
                <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white">
                      ไฟล์: {sheetMeta.title}
                    </span>
                    <span className="text-slate-400">
                      พบ {sheetMeta.sheets.length} แท็บ
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <select
                      value={selectedSheetTitle}
                      onChange={(e) => setSelectedSheetTitle(e.target.value)}
                      className="flex-1 bg-[#111827] border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
                    >
                      {sheetMeta.sheets.map((s) => (
                        <option key={s.sheetId} value={s.title}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busySheets}
                      onClick={handlePreviewSheetData}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold min-h-[42px]"
                    >
                      ตรวจสอบข้อมูล
                    </button>
                  </div>
                </div>
              )}

              {sheetPreviewEmployees && (
                <div className="bg-[#090d16] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-emerald-300">
                      พร้อมซิงค์ {sheetPreviewEmployees.length.toLocaleString()} รายชื่อเข้าสู่ Firestore
                    </div>
                    <button
                      type="button"
                      disabled={busyImport}
                      onClick={() =>
                        handleConfirmSyncToFirestore(
                          sheetPreviewEmployees,
                          `Google Sheets (${sheetMeta?.title} · ${selectedSheetTitle})`
                        )
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition min-h-[40px]"
                    >
                      ซิงค์เข้าสู่ Firestore ทันที
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1 max-h-28 overflow-y-auto">
                    {sheetPreviewEmployees.slice(0, 4).map((e) => (
                      <div key={e.id} className="font-mono-tabular truncate">
                        {e.id} · {e.fullName} · {e.inCharge} · โต๊ะ {e.table || '-'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preserveExistingReg}
                  onChange={(e) => setPreserveExistingReg(e.target.checked)}
                  className="rounded border-slate-600 bg-[#090d16]"
                />
                <span>รักษาสถานะและเวลาเช็คอินเดิมของพนักงานที่ลงทะเบียนแล้ว</span>
              </label>
            </div>

            {/* Quick Initial Seed + Excel Import/Export */}
            <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-pink-400" />
                  <span>นำเข้าชุดข้อมูลเริ่มต้น &amp; Excel</span>
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  นำเข้าฐานข้อมูลพนักงานตั้งต้น 764 รายชื่อเข้าสู่ Firestore ได้ทันที หรืออัปโหลดไฟล์ Excel / CSV เพื่ออัปเดตข้อมูล
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={busyImport}
                  onClick={handleImportInitialDataset}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition min-h-[46px]"
                >
                  <Database className="w-4 h-4" />
                  <span>นำเข้าฐานข้อมูลเริ่มต้น (764 รายชื่อ)</span>
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={downloadEmployeeTemplateExcel}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition min-h-[42px]"
                  >
                    <Download className="w-4 h-4" />
                    <span>เทมเพลต Excel</span>
                  </button>

                  <label className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition min-h-[42px]">
                    <Upload className="w-4 h-4" />
                    <span>อัปโหลด .xlsx/.csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Registration Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  รายชื่อพนักงานทั้งหมด ({filteredEmployees.length.toLocaleString()} รายการ)
                </h2>
                <p className="text-xs text-slate-400">
                  ค้นหา ตรวจสอบเวลาลงทะเบียน ดูภาพเซลฟี่ และจัดการเช็คอินด้วยตนเอง
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchRegis}
                    onChange={(e) => setSearchRegis(e.target.value)}
                    placeholder="ค้นหารหัส, ชื่อ, โต๊ะ..."
                    className="bg-[#090d16] border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                  />
                </div>
                <select
                  value={filterRegisStatus}
                  onChange={(e) =>
                    setFilterRegisStatus(e.target.value as 'all' | 'registered' | 'pending')
                  }
                  className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="all">สถานะทั้งหมด</option>
                  <option value="registered">ลงทะเบียนแล้ว</option>
                  <option value="pending">ยังไม่ลงทะเบียน</option>
                </select>
                <select
                  value={filterRegisProbation}
                  onChange={(e) =>
                    setFilterRegisProbation(e.target.value as 'all' | 'probation' | 'regular')
                  }
                  className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="all">ทุกสถานะงาน</option>
                  <option value="probation">ทดลองงาน (&lt;120 วัน)</option>
                  <option value="regular">พนักงานประจำ</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[480px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090d16] text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">รหัส</th>
                    <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-3 px-4">ฝ่าย · ตำแหน่ง</th>
                    <th className="py-3 px-4 text-center">โต๊ะ</th>
                    <th className="py-3 px-4">สถานะ &amp; เวลา</th>
                    <th className="py-3 px-4 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.slice(0, 150).map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-4 font-mono-tabular font-bold text-indigo-300">
                          {emp.id}
                        </td>
                        <td className="py-2.5 px-4 text-white font-medium">
                          {emp.fullName}
                          {emp.isProbation && (
                            <span className="ml-2 text-[10px] text-amber-300">
                              (ทดลองงาน)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {[emp.inCharge, emp.pos].filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono-tabular font-bold text-amber-300">
                          {emp.table || '-'}
                        </td>
                        <td className="py-2.5 px-4">
                          {emp.registered ? (
                            <span className="text-emerald-400 font-mono-tabular">
                              เช็คอิน #{emp.checkInOrder || '-'} · {emp.regTimeStr}
                            </span>
                          ) : (
                            <span className="text-slate-500">ยังไม่ลงทะเบียน</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {emp.hasPhoto && (
                              <button
                                type="button"
                                onClick={() => handleViewEmployeePhoto(emp)}
                                title="ดูรูปถ่าย"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 transition"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                toggleEmployeeRegistrationAdmin(
                                  emp,
                                  !emp.registered,
                                  stats.registered + 1
                                )
                                  .then(() =>
                                    onToast(
                                      emp.registered
                                        ? `ยกเลิกเช็คอิน ${emp.id} แล้ว`
                                        : `เช็คอิน ${emp.id} สำเร็จ`,
                                      'info'
                                    )
                                  )
                                  .catch((err) => onToast(err.message, 'error'))
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                                emp.registered
                                  ? 'bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200'
                                  : 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30'
                              }`}
                            >
                              {emp.registered ? 'ยกเลิกเช็คอิน' : 'เช็คอิน'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {filteredEmployees.length > 150 && (
                <div className="p-3 text-center text-xs text-slate-400 bg-[#090d16] border-t border-slate-800">
                  แสดง 150 รายการแรกจากทั้งหมด {filteredEmployees.length.toLocaleString()} รายการ — ใช้ช่องค้นหาเพื่อกรองเฉพาะบุคคล
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Prizes CRUD */}
      {activeTab === 'prizes' && (
        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                จัดการรายการของรางวัล
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                เพิ่ม ลบ แก้ไข ของรางวัล จำนวนรางวัล และลำดับการจับรางวัลบนเวที
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {prizes.length === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    seedSamplePrizes()
                      .then(() => onToast('เพิ่มชุดของรางวัลตัวอย่างสำเร็จ', 'success'))
                      .catch((err) => onToast(err.message, 'error'))
                  }
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold transition min-h-[42px]"
                >
                  เพิ่มของรางวัลตัวอย่าง
                </button>
              )}
              <button
                type="button"
                onClick={openNewPrizeModal}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition min-h-[42px]"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มของรางวัลใหม่</span>
              </button>
            </div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-3xl p-5 sm:p-6">
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090d16] text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 text-center">ลำดับ</th>
                    <th className="py-3 px-4">รูปภาพ</th>
                    <th className="py-3 px-4">ชื่อของรางวัล</th>
                    <th className="py-3 px-4 text-center">ทั้งหมด</th>
                    <th className="py-3 px-4 text-center">จับไปแล้ว</th>
                    <th className="py-3 px-4 text-center">คงเหลือ</th>
                    <th className="py-3 px-4 text-center">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {prizes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        ยังไม่มีรายการของรางวัล กดปุ่ม &quot;เพิ่มของรางวัลใหม่&quot; ด้านบน
                      </td>
                    </tr>
                  ) : (
                    prizes.map((p) => {
                      const remain = Math.max(0, p.qty - p.drawn);
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 text-center font-mono-tabular font-bold text-amber-300">
                            #{p.order}
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#090d16] border border-slate-800 flex items-center justify-center">
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Gift className="w-5 h-5 text-amber-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-white text-sm">
                            {p.name}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-tabular">
                            {p.qty}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-tabular text-pink-400">
                            {p.drawn}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-tabular font-bold text-emerald-400">
                            {remain}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditPrizeModal(p)}
                                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 transition"
                                title="แก้ไข"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onConfirm({
                                    title: `ลบของรางวัล "${p.name}"?`,
                                    description: 'รายการของรางวัลนี้จะถูกลบออกจากระบบอย่างถาวร',
                                    confirmLabel: 'ลบของรางวัล',
                                    destructive: true,
                                    onConfirm: async () => {
                                      await deletePrize(p.id);
                                      onToast('ลบของรางวัลแล้ว', 'info');
                                    },
                                  })
                                }
                                className="p-2 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-400 hover:text-white transition"
                                title="ลบ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Lucky Draw Control, Super Admin Blocklist & Winners */}
      {activeTab === 'lucky' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Prize Selection */}
            <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  รางวัลที่กำลังจะสุ่ม (Active Prize)
                </h2>
                <span className="text-xs text-emerald-400 font-mono-tabular font-semibold">
                  ผู้มีสิทธิ์ลุ้น {eligibleEmployees.length.toLocaleString()} ท่าน
                </span>
              </div>

              <div className="flex items-center gap-4 bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 flex items-center justify-center">
                  {activePrize?.imageUrl ? (
                    <img
                      src={activePrize.imageUrl}
                      alt={activePrize.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Gift className="w-7 h-7 text-amber-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">
                    {activePrize ? activePrize.name : 'กรุณาเลือกรางวัล'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono-tabular mt-1">
                    คงเหลือ:{' '}
                    {activePrize
                      ? Math.max(0, activePrize.qty - activePrize.drawn)
                      : 0}{' '}
                    / {activePrize?.qty ?? 0}
                  </div>
                </div>
              </div>

              <select
                value={config.activePrizeId || activePrize?.id || ''}
                onChange={(e) =>
                  updateEventConfig({ activePrizeId: e.target.value })
                    .then(() => onToast('เปลี่ยนของรางวัลรอบปัจจุบันแล้ว', 'success'))
                    .catch((err) => onToast(err.message, 'error'))
                }
                className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white outline-none"
              >
                <option value="">-- เลือกของรางวัล --</option>
                {prizes.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.order} · {p.name} (เหลือ {Math.max(0, p.qty - p.drawn)}/{p.qty})
                  </option>
                ))}
              </select>
            </div>

            {/* Executive Remote Control */}
            <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  ควบคุมปุ่มกดผู้บริหาร (Executive Draw)
                </h2>
                <span
                  className={`text-xs font-bold ${
                    config.execReady ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {config.execReady ? 'ปลดล็อกอยู่ (พร้อมกด)' : 'ปุ่มล็อกอยู่'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    updateEventConfig({
                      execReady: !config.execReady,
                      isRedrawActive: false,
                    })
                      .then(() =>
                        onToast(
                          !config.execReady
                            ? 'เปิดสิทธิ์ปุ่มผู้บริหารแล้ว'
                            : 'ล็อกปุ่มผู้บริหารแล้ว',
                          'info'
                        )
                      )
                      .catch((err) => onToast(err.message, 'error'))
                  }
                  className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition min-h-[46px] ${
                    config.execReady
                      ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
                  }`}
                >
                  {config.execReady ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>ล็อกปุ่มผู้บริหาร</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>เปิดสิทธิผู้บริหาร (1 ครั้ง)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyExecUrl}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition min-h-[46px]"
                >
                  <ClipboardCopy className="w-4 h-4" />
                  <span>คัดลอกลิงก์ผู้บริหาร</span>
                </button>
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  disabled={winners.length === 0}
                  onClick={() => {
                    const latest = winners[0];
                    if (!latest) return;
                    const p = prizes.find((item) => item.id === latest.prizeId);
                    onConfirm({
                      title: 'ยืนยันสุ่มรางวัลล่าสุดใหม่?',
                      description: `ระบบจะยกเลิกผลรางวัลของ "${latest.name}" (${latest.prizeName}) และเปิดสิทธิ์ให้ผู้บริหารสุ่มผู้โชคดีคนใหม่ทันที`,
                      confirmLabel: 'สุ่มใหม่อีกครั้ง',
                      destructive: true,
                      onConfirm: async () => {
                        await redrawLatestWinner(latest, p);
                        onToast('ยกเลิกผลล่าสุดและเปิดสิทธิ์สุ่มใหม่แล้ว', 'info');
                      },
                    });
                  }}
                  className="text-rose-400 hover:text-rose-300 disabled:opacity-40 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>สุ่มผู้โชคดีล่าสุดใหม่ (Redraw)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdminDrawNow}
                  className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>แอดมินสุ่มรางวัลทันที</span>
                </button>
              </div>
            </div>
          </div>

          {/* Super Admin Blocklist Trigger & Section */}
          {isSuperAdmin && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (blockSectionUnlocked) {
                      setBlockSectionUnlocked(false);
                    } else {
                      setBlockPinInput('');
                      setBlockPinError('');
                      setBlockPinModalOpen(true);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#111827] border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 flex items-center gap-2 transition"
                >
                  {blockSectionUnlocked ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-amber-300" />
                      <span>ซ่อนเมนูบล็อคสิทธิ์</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>ตั้งค่าบล็อคสิทธิ์ (PIN 8 หลัก)</span>
                    </>
                  )}
                </button>
              </div>

              {blockSectionUnlocked && (
                <div className="bg-[#111827] border border-amber-500/30 rounded-3xl p-6 space-y-6">
                  {/* Block by Position */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-white">
                          บล็อคสิทธิ์ตามตำแหน่ง (Block by Position)
                        </h3>
                        <p className="text-xs text-slate-400">
                          คลิกที่ตำแหน่งเพื่อบล็อคหรือปลดบล็อคสิทธิ์การลุ้นรางวัลของพนักงานในตำแหน่งนั้น
                        </p>
                      </div>
                      <span className="text-xs text-amber-300 font-mono-tabular font-semibold">
                        บล็อคอยู่ {config.blockedPositions.length} ตำแหน่ง
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {distinctPositions.map((pos) => {
                        const isBlocked = config.blockedPositions.some(
                          (b) => b.toUpperCase() === pos.name.toUpperCase()
                        );
                        return (
                          <button
                            key={pos.name}
                            type="button"
                            onClick={() => {
                              const next = isBlocked
                                ? config.blockedPositions.filter(
                                    (b) => b.toUpperCase() !== pos.name.toUpperCase()
                                  )
                                : [...config.blockedPositions, pos.name];
                              updateEventConfig({ blockedPositions: next })
                                .then(() =>
                                  onToast(
                                    isBlocked
                                      ? `ปลดบล็อคตำแหน่ง ${pos.name} แล้ว`
                                      : `บล็อคตำแหน่ง ${pos.name} แล้ว`,
                                    'info'
                                  )
                                )
                                .catch((e) => onToast(e.message, 'error'));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                              isBlocked
                                ? 'bg-rose-600/20 border-rose-500/50 text-rose-300'
                                : 'bg-[#090d16] border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {pos.name} ({pos.count}) · {isBlocked ? 'บล็อคแล้ว' : 'มีสิทธิ์'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Block Probation */}
                  <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        บล็อคสิทธิ์ผู้ที่อยู่ระหว่างทดลองงาน (&lt; 120 วัน)
                      </h4>
                      <p className="text-xs text-slate-400">
                        ตัดสิทธิ์การลุ้นรางวัลสำหรับพนักงานที่อายุงานน้อยกว่า 120 วัน ({stats.probation} ท่าน)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateEventConfig({ blockProbation: !config.blockProbation })
                          .then(() =>
                            onToast(
                              !config.blockProbation
                                ? 'เปิดการบล็อคพนักงานทดลองงานแล้ว'
                                : 'ปลดบล็อคพนักงานทดลองงานแล้ว',
                              'info'
                            )
                          )
                          .catch((e) => onToast(e.message, 'error'))
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition min-h-[40px] shrink-0 ${
                        config.blockProbation
                          ? 'bg-rose-600 text-white'
                          : 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {config.blockProbation ? 'กำลังบล็อคทดลองงาน' : 'อนุญาตให้ร่วมลุ้น'}
                    </button>
                  </div>

                  {/* Individual Blocking */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-sm font-bold text-white">
                        จัดการบล็อคสิทธิ์รายบุคคล
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={searchBlock}
                          onChange={(e) => setSearchBlock(e.target.value)}
                          placeholder="ค้นหารหัส, ชื่อ..."
                          className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                        />
                        <select
                          value={filterBlockPos}
                          onChange={(e) => setFilterBlockPos(e.target.value)}
                          className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="all">ทุกตำแหน่ง</option>
                          {distinctPositions.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={filterBlockStatus}
                          onChange={(e) =>
                            setFilterBlockStatus(
                              e.target.value as 'all' | 'blocked' | 'unblocked'
                            )
                          }
                          className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="all">ทั้งหมด</option>
                          <option value="blocked">ถูกบล็อค</option>
                          <option value="unblocked">มีสิทธิ์ลุ้น</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-72">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="py-2.5 px-4">รหัส</th>
                            <th className="py-2.5 px-4">ชื่อ - นามสกุล</th>
                            <th className="py-2.5 px-4">ตำแหน่ง</th>
                            <th className="py-2.5 px-4">สถานะสิทธิ์</th>
                            <th className="py-2.5 px-4 text-center">รายบุคคล</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {employees
                            .filter((emp) => {
                              const idBlocked = config.blockedIds.includes(
                                emp.id.toUpperCase()
                              );
                              const posBlocked = config.blockedPositions.some(
                                (p) => p.toUpperCase() === emp.pos.toUpperCase()
                              );
                              const probBlocked =
                                config.blockProbation && emp.isProbation;
                              const anyBlocked = idBlocked || posBlocked || probBlocked;

                              const q = searchBlock.trim().toLowerCase();
                              const matchQ =
                                !q ||
                                emp.id.toLowerCase().includes(q) ||
                                emp.fullName.toLowerCase().includes(q);
                              const matchPos =
                                filterBlockPos === 'all' ||
                                emp.pos.toUpperCase() === filterBlockPos.toUpperCase();
                              const matchStatus =
                                filterBlockStatus === 'all' ||
                                (filterBlockStatus === 'blocked' ? anyBlocked : !anyBlocked);
                              return matchQ && matchPos && matchStatus;
                            })
                            .slice(0, 80)
                            .map((emp) => {
                              const idBlocked = config.blockedIds.includes(
                                emp.id.toUpperCase()
                              );
                              const posBlocked = config.blockedPositions.some(
                                (p) => p.toUpperCase() === emp.pos.toUpperCase()
                              );
                              const probBlocked =
                                config.blockProbation && emp.isProbation;
                              const anyBlocked = idBlocked || posBlocked || probBlocked;

                              return (
                                <tr key={emp.id}>
                                  <td className="py-2 px-4 font-mono-tabular font-bold text-indigo-300">
                                    {emp.id}
                                  </td>
                                  <td className="py-2 px-4 text-white">{emp.fullName}</td>
                                  <td className="py-2 px-4 text-slate-400">
                                    {emp.pos || '-'}
                                  </td>
                                  <td className="py-2 px-4">
                                    {anyBlocked ? (
                                      <span className="text-rose-400 font-semibold">
                                        ถูกบล็อค
                                      </span>
                                    ) : (
                                      <span className="text-emerald-400">มีสิทธิ์ลุ้น</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const upper = emp.id.toUpperCase();
                                        const next = idBlocked
                                          ? config.blockedIds.filter((x) => x !== upper)
                                          : [...config.blockedIds, upper];
                                        updateEventConfig({ blockedIds: next })
                                          .then(() =>
                                            onToast(
                                              idBlocked
                                                ? `ปลดบล็อค ${emp.id} แล้ว`
                                                : `บล็อค ${emp.id} แล้ว`,
                                              'info'
                                            )
                                          )
                                          .catch((e) => onToast(e.message, 'error'));
                                      }}
                                      className={`px-3 py-1 rounded-lg text-[11px] font-semibold ${
                                        idBlocked
                                          ? 'bg-slate-800 text-slate-200'
                                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                      }`}
                                    >
                                      {idBlocked ? 'ปลดบล็อค' : 'บล็อค'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Winners History Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  ประวัติผู้โชคดีที่ได้รับรางวัล ({winners.length} ท่าน)
                </h2>
                <p className="text-xs text-slate-400">
                  ซิงค์แบบเรียลไทม์จาก Firestore ทันทีที่ผู้บริหารกดปุ่มสุ่มรางวัล
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={winners.length === 0}
                  onClick={() => downloadWinnersExcelFile(winners)}
                  className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 disabled:opacity-40 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition min-h-[40px]"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลด Excel</span>
                </button>
                <button
                  type="button"
                  disabled={winners.length === 0}
                  onClick={() =>
                    onConfirm({
                      title: 'รีเซ็ตการจับรางวัลทั้งหมด?',
                      description:
                        'รายชื่อผู้โชคดีทั้งหมดจะถูกลบ และจำนวนรางวัลคงเหลือจะถูกรีเซ็ตกลับเป็นค่าเริ่มต้นทั้งหมด',
                      confirmLabel: 'ยืนยันรีเซ็ตทั้งหมด',
                      destructive: true,
                      onConfirm: async () => {
                        await resetAllLuckyDraws(winners, prizes);
                        onToast('รีเซ็ตผลการจับรางวัลทั้งหมดเรียบร้อย', 'info');
                      },
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 disabled:opacity-40 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition min-h-[40px]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>รีเซ็ตทั้งหมด</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">เวลาที่ได้รับ</th>
                    <th className="py-3 px-4">ของรางวัล</th>
                    <th className="py-3 px-4">รหัส</th>
                    <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-3 px-4">ฝ่าย · ตำแหน่ง</th>
                    <th className="py-3 px-4 text-center">โต๊ะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {winners.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        ยังไม่มีผู้โชคดีในรอบนี้
                      </td>
                    </tr>
                  ) : (
                    winners.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono-tabular text-slate-400">
                          {w.drawnAtStr}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-amber-300">
                          {w.prizeName}
                        </td>
                        <td className="py-2.5 px-4 font-mono-tabular text-indigo-300">
                          {w.empId}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-white">
                          {w.name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {[w.inCharge, w.pos].filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono-tabular font-bold text-pink-300">
                          {w.table || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {photoPreviewModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhotoPreviewModal(null);
          }}
        >
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-sm w-full p-5 space-y-4 text-center relative">
            <button
              type="button"
              onClick={() => setPhotoPreviewModal(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold text-white">
              {photoPreviewModal.name}
            </div>
            <div className="text-xs font-mono-tabular text-indigo-300">
              รหัส {photoPreviewModal.empId}
            </div>
            <img
              src={photoPreviewModal.url}
              alt={photoPreviewModal.name}
              className="w-full rounded-2xl border border-slate-800 object-cover"
            />
          </div>
        </div>
      )}

      {/* Prize Add/Edit Modal */}
      {prizeModalOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrizeModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSavePrizeSubmit}
            className="bg-[#111827] border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingPrize ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัลใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setPrizeModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ชื่อของรางวัล *
              </label>
              <input
                type="text"
                required
                value={prizeName}
                onChange={(e) => setPrizeName(e.target.value)}
                placeholder="เช่น iPhone 17 Pro, ทองคำ 1 บาท"
                className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  จำนวน (ชิ้น) *
                </label>
                <input
                  type="number"
                  required
                  min={Math.max(1, editingPrize?.drawn ?? 1)}
                  value={prizeQty}
                  onChange={(e) => setPrizeQty(Number(e.target.value))}
                  className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ลำดับการจับ *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={prizeOrder}
                  onChange={(e) => setPrizeOrder(Number(e.target.value))}
                  className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ลิงก์รูปภาพของรางวัล (ไม่บังคับ)
              </label>
              <input
                type="url"
                value={prizeImage}
                onChange={(e) => setPrizeImage(e.target.value)}
                placeholder="https://..."
                className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrizeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold min-h-[42px]"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={savingPrize}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold min-h-[42px]"
              >
                {savingPrize ? 'กำลังบันทึก...' : 'บันทึกของรางวัล'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8-Digit Blocklist Security PIN Modal */}
      {blockPinModalOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBlockPinModalOpen(false);
          }}
        >
          <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-xs w-full p-6 text-center space-y-4 relative">
            <button
              type="button"
              onClick={() => setBlockPinModalOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Security Passcode</h3>
              <p className="text-xs text-slate-400">
                กรอก PIN 8 หลัก (25102612) เพื่อเปิดเมนูบล็อคสิทธิ์
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 py-1">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border ${
                    i < blockPinInput.length
                      ? 'bg-amber-400 border-amber-300'
                      : 'bg-[#090d16] border-slate-600'
                  }`}
                />
              ))}
            </div>
            {blockPinError && (
              <p className="text-xs text-rose-400 font-semibold">{blockPinError}</p>
            )}
            <div className="grid grid-cols-3 gap-2 max-w-[230px] mx-auto select-none">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleBlockPinDigit(d)}
                  className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-lg font-bold text-white"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setBlockPinInput('');
                  setBlockPinError('');
                }}
                className="h-11 rounded-xl bg-[#090d16] text-xs font-bold text-rose-400"
              >
                ล้าง
              </button>
              <button
                type="button"
                onClick={() => handleBlockPinDigit('0')}
                className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-lg font-bold text-white"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setBlockPinInput((p) => p.slice(0, -1))}
                className="h-11 rounded-xl bg-[#090d16] text-sm font-bold text-amber-400"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
