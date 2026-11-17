import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  MonitorPlay,
  QrCode,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AdminConsoleView } from './components/AdminConsoleView';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExecutiveDrawView } from './components/ExecutiveDrawView';
import { LiveStageView } from './components/LiveStageView';
import { ToastContainer } from './components/ToastContainer';
import { UserRegistrationView } from './components/UserRegistrationView';
import {
  db,
  googleSignIn,
  initAuth,
  isOwnerAdminUser,
  logoutGoogle,
} from './lib/firebase';
import {
  DEFAULT_EVENT_CONFIG,
  subscribeEmployees,
  subscribeEventConfig,
  subscribePrizes,
  subscribeWinners,
} from './lib/firestoreService';
import {
  AppRoute,
  ConfirmDialogState,
  Employee,
  EventConfig,
  Prize,
  ToastItem,
  Winner,
} from './types/event';

const VALID_ROUTES: AppRoute[] = ['user', 'lucky', 'live', 'exec', 'admin'];

function parseRouteFromUrl(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  if (page && VALID_ROUTES.includes(page as AppRoute)) {
    return page as AppRoute;
  }
  return 'user';
}

function AppContent() {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromUrl());
  const [user, setUser] = useState<User | null>(null);
  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(null);
  const [isAdminAuth, setIsAdminAuth] = useState(false);

  const [config, setConfig] = useState<EventConfig>(DEFAULT_EVENT_CONFIG);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'ยืนยัน',
    onConfirm: () => {},
  });

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    const url = new URL(window.location.href);
    if (nextRoute === 'user') {
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('page', nextRoute);
    }
    window.history.replaceState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRouteFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const openConfirm = useCallback(
    (dialog: Omit<ConfirmDialogState, 'open'>) => {
      setConfirmDialog({ ...dialog, open: true });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  }, []);

  // Firebase Auth & Admin verification
  useEffect(() => {
    const unsub = initAuth(async (nextUser, token) => {
      setUser(nextUser);
      setSheetsAccessToken(token);

      if (!nextUser) {
        setIsAdminAuth(false);
        return;
      }

      if (isOwnerAdminUser(nextUser)) {
        setIsAdminAuth(true);
        return;
      }

      if (nextUser.emailVerified) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', nextUser.uid));
          setIsAdminAuth(adminSnap.exists());
        } catch {
          setIsAdminAuth(false);
        }
      } else {
        setIsAdminAuth(false);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore subscriptions
  useEffect(() => {
    let settledConfig = false;
    let settledEmployees = false;
    let settledPrizes = false;
    let settledWinners = false;

    const checkAllSettled = () => {
      if (settledConfig && settledEmployees && settledPrizes && settledWinners) {
        setLoadingData(false);
      }
    };

    const unsubConfig = subscribeEventConfig((cfg) => {
      setConfig(cfg);
      settledConfig = true;
      checkAllSettled();
    });

    const unsubEmployees = subscribeEmployees((list) => {
      setEmployees(list);
      settledEmployees = true;
      checkAllSettled();
    });

    const unsubPrizes = subscribePrizes((list) => {
      setPrizes(list);
      settledPrizes = true;
      checkAllSettled();
    });

    const unsubWinners = subscribeWinners((list) => {
      setWinners(list);
      settledWinners = true;
      checkAllSettled();
    });

    return () => {
      unsubConfig();
      unsubEmployees();
      unsubPrizes();
      unsubWinners();
    };
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { user: signedInUser, accessToken } = await googleSignIn();
      setUser(signedInUser);
      setSheetsAccessToken(accessToken);

      let adminAuthorized = isOwnerAdminUser(signedInUser);
      if (!adminAuthorized && signedInUser.emailVerified) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', signedInUser.uid));
          adminAuthorized = adminSnap.exists();
        } catch {
          adminAuthorized = false;
        }
      }
      setIsAdminAuth(adminAuthorized);

      if (adminAuthorized) {
        showToast(
          `เข้าสู่ระบบสำเร็จ: ${signedInUser.email || 'Admin'}`,
          'success'
        );
      } else {
        showToast(
          'บัญชี Google นี้ไม่มีสิทธิ์ Admin สำหรับจัดการข้อมูล (ต้องใช้อีเมลเจ้าของระบบ)',
          'warning'
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบ Google ได้';
      if (!msg.includes('popup-closed-by-user')) {
        showToast(msg, 'error');
      }
    }
  }, [showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    try {
      await logoutGoogle();
      setUser(null);
      setSheetsAccessToken(null);
      setIsAdminAuth(false);
      showToast('ออกจากระบบ Google แล้ว', 'info');
    } catch {
      showToast('ไม่สามารถออกจากระบบได้', 'error');
    }
  }, [showToast]);

  const navItems: { id: Exclude<AppRoute, 'admin'>; label: string }[] = [
    { id: 'user', label: 'ลงทะเบียน' },
    { id: 'lucky', label: 'ผลรางวัล' },
    { id: 'live', label: 'Live เวที' },
    { id: 'exec', label: 'ผู้บริหาร' },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Three-Zone Top Bar */}
      <header className="sticky top-0 z-40 h-14 bg-[#0b1120]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigate('user')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus:outline-none group"
          >
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-500/20 shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </span>
            <span className="font-bold text-sm sm:text-base tracking-tight text-white group-hover:text-pink-200 transition">
              Event Lucky Draw
            </span>
          </button>

          {/* Zone 2: Center Navigation Links (Desktop) */}
          <nav
            aria-label="หน้าหลัก"
            className="hidden md:flex items-center gap-1"
          >
            {navItems.map((item) => {
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition ${
                    active
                      ? 'bg-slate-800/90 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => navigate('admin')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition min-h-[38px] ${
                route === 'admin'
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/25'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Admin Console</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-16 md:pb-6">
        {(route === 'user' || route === 'lucky') && (
          <UserRegistrationView
            mode={route}
            onModeChange={(m) => navigate(m)}
            config={config}
            employees={employees}
            prizes={prizes}
            winners={winners}
            loadingData={loadingData}
            onToast={showToast}
            onOpenAdmin={() => navigate('admin')}
          />
        )}

        {route === 'live' && (
          <LiveStageView
            config={config}
            employees={employees}
            prizes={prizes}
            winners={winners}
          />
        )}

        {route === 'exec' && (
          <ExecutiveDrawView
            config={config}
            employees={employees}
            prizes={prizes}
            winners={winners}
            isAdminAuth={isAdminAuth}
            onGoogleSignIn={handleGoogleSignIn}
            onToast={showToast}
          />
        )}

        {route === 'admin' && (
          <AdminConsoleView
            config={config}
            employees={employees}
            prizes={prizes}
            winners={winners}
            isAdminAuth={isAdminAuth}
            userEmail={user?.email ?? null}
            sheetsAccessToken={sheetsAccessToken}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onToast={showToast}
            onConfirm={openConfirm}
            onNavigate={(r) => navigate(r)}
          />
        )}
      </main>

      {/* Mobile Bottom Thumb Navigation Bar (56px height, <=15% viewport cap) */}
      <nav
        aria-label="เมนูมือถือ"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[#0b1120]/95 backdrop-blur-md border-t border-slate-800/80 px-1 flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => navigate('user')}
          className={`flex flex-col items-center justify-center min-h-[44px] px-2 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
            route === 'user' ? 'text-pink-400' : 'text-slate-400'
          }`}
        >
          <QrCode className="w-4 h-4 mb-0.5" />
          <span>ลงทะเบียน</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('lucky')}
          className={`flex flex-col items-center justify-center min-h-[44px] px-2 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
            route === 'lucky' ? 'text-pink-400' : 'text-slate-400'
          }`}
        >
          <Trophy className="w-4 h-4 mb-0.5" />
          <span>ผลรางวัล</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('live')}
          className={`flex flex-col items-center justify-center min-h-[44px] px-2 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
            route === 'live' ? 'text-pink-400' : 'text-slate-400'
          }`}
        >
          <MonitorPlay className="w-4 h-4 mb-0.5" />
          <span>Live เวที</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('exec')}
          className={`flex flex-col items-center justify-center min-h-[44px] px-2 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
            route === 'exec' ? 'text-pink-400' : 'text-slate-400'
          }`}
        >
          <Award className="w-4 h-4 mb-0.5" />
          <span>ผู้บริหาร</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('admin')}
          className={`flex flex-col items-center justify-center min-h-[44px] px-2 rounded-lg text-[10px] font-medium whitespace-nowrap transition ${
            route === 'admin' ? 'text-pink-400' : 'text-slate-400'
          }`}
        >
          <ShieldCheck className="w-4 h-4 mb-0.5" />
          <span>Admin</span>
        </button>
      </nav>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal dialog={confirmDialog} onClose={closeConfirm} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
