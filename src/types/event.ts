export type AppRoute = 'user' | 'lucky' | 'live' | 'exec' | 'admin';

export interface Employee {
  id: string;
  inCharge: string;
  prefix: string;
  firstName: string;
  lastName: string;
  fullName: string;
  pos: string;
  table: string;
  startDate: string;
  isProbation: boolean;
  registered: boolean;
  regTimeStr: string;
  regTimestamp: number;
  checkInOrder: number;
  hasPhoto: boolean;
}

export interface CheckinPhoto {
  empId: string;
  photoDataUrl: string;
}

export interface Prize {
  id: string;
  name: string;
  qty: number;
  drawn: number;
  order: number;
  imageUrl: string;
}

export interface Winner {
  id: string;
  empId: string;
  name: string;
  inCharge: string;
  pos: string;
  table: string;
  prizeId: string;
  prizeName: string;
  prizeImageUrl: string;
  drawnAtStr: string;
  drawnTimestamp: number;
}

export interface EventConfig {
  sysOpen: boolean;
  execReady: boolean;
  isRedrawActive: boolean;
  activePrizeId: string;
  blockProbation: boolean;
  blockedPositions: string[];
  blockedIds: string[];
  latestDrawId: string;
  latestWinnerEmpId: string;
  latestWinnerName: string;
  latestWinnerInCharge: string;
  latestWinnerPos: string;
  latestWinnerTable: string;
  latestWinnerPrize: string;
  latestWinnerPrizeImage: string;
  latestDrawTimestamp: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}
