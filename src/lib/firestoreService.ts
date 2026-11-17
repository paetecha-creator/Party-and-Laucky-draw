import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckinPhoto,
  Employee,
  EventConfig,
  Prize,
  Winner,
} from '../types/event';
import { db, handleFirestoreError, OperationType } from './firebase';

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  sysOpen: true,
  execReady: false,
  isRedrawActive: false,
  activePrizeId: '',
  blockProbation: false,
  blockedPositions: [],
  blockedIds: [],
  latestDrawId: '',
  latestWinnerEmpId: '',
  latestWinnerName: '',
  latestWinnerInCharge: '',
  latestWinnerPos: '',
  latestWinnerTable: '',
  latestWinnerPrize: '',
  latestWinnerPrizeImage: '',
  latestDrawTimestamp: 0,
};

export function formatThaiDateTime(date = new Date()): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

export function subscribeEventConfig(onChange: (cfg: EventConfig) => void) {
  const ref = doc(db, 'config', 'event_state');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(DEFAULT_EVENT_CONFIG);
        return;
      }
      const d = snap.data();
      onChange({
        sysOpen: d.sysOpen ?? true,
        execReady: d.execReady ?? false,
        isRedrawActive: d.isRedrawActive ?? false,
        activePrizeId: String(d.activePrizeId ?? ''),
        blockProbation: Boolean(d.blockProbation),
        blockedPositions: Array.isArray(d.blockedPositions) ? d.blockedPositions : [],
        blockedIds: Array.isArray(d.blockedIds) ? d.blockedIds : [],
        latestDrawId: String(d.latestDrawId ?? ''),
        latestWinnerEmpId: String(d.latestWinnerEmpId ?? ''),
        latestWinnerName: String(d.latestWinnerName ?? ''),
        latestWinnerInCharge: String(d.latestWinnerInCharge ?? ''),
        latestWinnerPos: String(d.latestWinnerPos ?? ''),
        latestWinnerTable: String(d.latestWinnerTable ?? ''),
        latestWinnerPrize: String(d.latestWinnerPrize ?? ''),
        latestWinnerPrizeImage: String(d.latestWinnerPrizeImage ?? ''),
        latestDrawTimestamp: Number(d.latestDrawTimestamp ?? 0),
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/event_state');
    }
  );
}

export function subscribeEmployees(onChange: (emps: Employee[]) => void) {
  const colRef = collection(db, 'employees');
  return onSnapshot(
    colRef,
    (snap) => {
      const list: Employee[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id ?? docSnap.id),
          inCharge: String(d.inCharge ?? ''),
          prefix: String(d.prefix ?? ''),
          firstName: String(d.firstName ?? ''),
          lastName: String(d.lastName ?? ''),
          fullName: String(d.fullName ?? ''),
          pos: String(d.pos ?? ''),
          table: String(d.table ?? ''),
          startDate: String(d.startDate ?? ''),
          isProbation: Boolean(d.isProbation),
          registered: Boolean(d.registered),
          regTimeStr: String(d.regTimeStr ?? ''),
          regTimestamp: Number(d.regTimestamp ?? 0),
          checkInOrder: Number(d.checkInOrder ?? 0),
          hasPhoto: Boolean(d.hasPhoto),
        };
      });
      list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    }
  );
}

export function subscribePrizes(onChange: (prizes: Prize[]) => void) {
  const q = query(collection(db, 'prizes'), orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: Prize[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id ?? docSnap.id),
          name: String(d.name ?? ''),
          qty: Number(d.qty ?? 1),
          drawn: Number(d.drawn ?? 0),
          order: Number(d.order ?? 1),
          imageUrl: String(d.imageUrl ?? ''),
        };
      });
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'prizes');
    }
  );
}

export function subscribeWinners(onChange: (winners: Winner[]) => void) {
  const q = query(collection(db, 'winners'), orderBy('drawnTimestamp', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: Winner[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id ?? docSnap.id),
          empId: String(d.empId ?? ''),
          name: String(d.name ?? ''),
          inCharge: String(d.inCharge ?? ''),
          pos: String(d.pos ?? ''),
          table: String(d.table ?? ''),
          prizeId: String(d.prizeId ?? ''),
          prizeName: String(d.prizeName ?? ''),
          prizeImageUrl: String(d.prizeImageUrl ?? ''),
          drawnAtStr: String(d.drawnAtStr ?? ''),
          drawnTimestamp: Number(d.drawnTimestamp ?? 0),
        };
      });
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'winners');
    }
  );
}

export function subscribeRecentCheckins(
  maxCount: number,
  onChange: (photos: Record<string, CheckinPhoto>) => void
) {
  const q = query(
    collection(db, 'checkins'),
    orderBy('createdAt', 'desc'),
    limit(maxCount)
  );
  return onSnapshot(
    q,
    (snap) => {
      const map: Record<string, CheckinPhoto> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[String(data.empId ?? d.id)] = {
          empId: String(data.empId ?? d.id),
          photoDataUrl: String(data.photoDataUrl ?? ''),
        };
      });
      onChange(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'checkins');
    }
  );
}

export async function fetchCheckinPhoto(empId: string): Promise<string> {
  const path = `checkins/${empId}`;
  try {
    const snap = await getDoc(doc(db, 'checkins', empId));
    if (snap.exists()) {
      return String(snap.data().photoDataUrl ?? '');
    }
    return '';
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function ensureEventConfigExists(): Promise<void> {
  const ref = doc(db, 'config', 'event_state');
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...DEFAULT_EVENT_CONFIG,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'config/event_state');
  }
}

export async function updateEventConfig(
  partial: Partial<EventConfig>
): Promise<void> {
  const ref = doc(db, 'config', 'event_state');
  try {
    const snap = await getDoc(ref);
    const payload = {
      ...partial,
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) {
      await setDoc(ref, {
        ...DEFAULT_EVENT_CONFIG,
        ...payload,
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'config/event_state');
  }
}

export async function registerEmployeeSelfCheckin(
  emp: Employee,
  photoDataUrl: string,
  checkInOrder: number
): Promise<{ regTimeStr: string; checkInOrder: number }> {
  const regTimeStr = formatThaiDateTime(new Date());
  const regTimestamp = Date.now();
  const hasPhoto = Boolean(photoDataUrl);
  const safePhoto = photoDataUrl.slice(0, 199000);

  const batch = writeBatch(db);
  const empRef = doc(db, 'employees', emp.id);
  batch.update(empRef, {
    registered: true,
    regTimeStr: regTimeStr.slice(0, 40),
    regTimestamp,
    checkInOrder,
    hasPhoto,
    updatedAt: serverTimestamp(),
  });

  if (hasPhoto) {
    const checkinRef = doc(db, 'checkins', emp.id);
    batch.set(checkinRef, {
      empId: emp.id,
      photoDataUrl: safePhoto,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return { regTimeStr, checkInOrder };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `employees/${emp.id}`);
  }
}

export async function toggleEmployeeRegistrationAdmin(
  emp: Employee,
  registered: boolean,
  nextOrder: number
): Promise<void> {
  const ref = doc(db, 'employees', emp.id);
  try {
    if (registered) {
      await updateDoc(ref, {
        registered: true,
        regTimeStr: formatThaiDateTime(new Date()),
        regTimestamp: Date.now(),
        checkInOrder: nextOrder,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        registered: false,
        regTimeStr: '',
        regTimestamp: 0,
        checkInOrder: 0,
        hasPhoto: false,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `employees/${emp.id}`);
  }
}

export async function importEmployeesBatch(
  incomingList: Employee[],
  existingMap: Map<string, Employee>,
  preserveExistingCheckin = true
): Promise<number> {
  const CHUNK_SIZE = 350;
  let importedCount = 0;

  for (let i = 0; i < incomingList.length; i += CHUNK_SIZE) {
    const chunk = incomingList.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const existing = existingMap.get(item.id);
      const keepExistingReg = preserveExistingCheckin && existing?.registered;

      const empRef = doc(db, 'employees', item.id);
      batch.set(empRef, {
        id: item.id.slice(0, 40),
        inCharge: item.inCharge.slice(0, 60),
        prefix: item.prefix.slice(0, 30),
        firstName: item.firstName.slice(0, 80),
        lastName: item.lastName.slice(0, 80),
        fullName: item.fullName.slice(0, 180),
        pos: item.pos.slice(0, 80),
        table: item.table.slice(0, 30),
        startDate: item.startDate.slice(0, 30),
        isProbation: Boolean(item.isProbation),
        registered: keepExistingReg ? true : Boolean(item.registered),
        regTimeStr: (keepExistingReg ? existing.regTimeStr : item.regTimeStr).slice(0, 40),
        regTimestamp: keepExistingReg ? existing.regTimestamp : item.regTimestamp,
        checkInOrder: keepExistingReg ? existing.checkInOrder : item.checkInOrder,
        hasPhoto: keepExistingReg ? existing.hasPhoto : Boolean(item.hasPhoto),
        updatedAt: serverTimestamp(),
      });
      importedCount++;
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  }

  return importedCount;
}

export async function savePrize(prize: {
  id?: string;
  name: string;
  qty: number;
  drawn?: number;
  order: number;
  imageUrl: string;
}): Promise<string> {
  const id =
    prize.id ||
    `prize_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'prizes', id);
  const qty = Math.max(1, Math.min(10000, Math.round(prize.qty)));
  const drawn = Math.max(0, Math.min(qty, Math.round(prize.drawn ?? 0)));
  const order = Math.max(1, Math.min(10000, Math.round(prize.order)));

  try {
    await setDoc(ref, {
      id,
      name: prize.name.trim().slice(0, 150),
      qty,
      drawn,
      order,
      imageUrl: prize.imageUrl.trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `prizes/${id}`);
  }
}

export async function deletePrize(prizeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'prizes', prizeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `prizes/${prizeId}`);
  }
}

export async function seedSamplePrizes(): Promise<void> {
  const samples = [
    { id: 'prize_01', name: 'ทองคำแท่ง 1 บาท', qty: 1, drawn: 0, order: 1, imageUrl: '' },
    { id: 'prize_02', name: 'iPhone 17 Pro 256GB', qty: 2, drawn: 0, order: 2, imageUrl: '' },
    { id: 'prize_03', name: 'iPad Air 11 นิ้ว', qty: 3, drawn: 0, order: 3, imageUrl: '' },
    { id: 'prize_04', name: 'Smart TV 55 นิ้ว 4K', qty: 3, drawn: 0, order: 4, imageUrl: '' },
    { id: 'prize_05', name: 'Central Gift Voucher 3,000 บาท', qty: 10, drawn: 0, order: 5, imageUrl: '' },
  ];
  const batch = writeBatch(db);
  for (const p of samples) {
    batch.set(doc(db, 'prizes', p.id), {
      ...p,
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'prizes');
  }
}

export function getEligibleEmployees(
  employees: Employee[],
  winners: Winner[],
  config: EventConfig
): Employee[] {
  const wonSet = new Set(winners.map((w) => w.empId.toUpperCase()));
  const blockedIdSet = new Set(config.blockedIds.map((id) => id.toUpperCase()));
  const blockedPosSet = new Set(
    config.blockedPositions.map((p) => p.trim().toUpperCase())
  );

  return employees.filter((emp) => {
    if (!emp.registered) return false;
    if (wonSet.has(emp.id.toUpperCase())) return false;
    if (blockedIdSet.has(emp.id.toUpperCase())) return false;
    if (emp.pos && blockedPosSet.has(emp.pos.trim().toUpperCase())) return false;
    if (config.blockProbation && emp.isProbation) return false;
    return true;
  });
}

export async function executeLuckyDraw(
  prize: Prize,
  eligible: Employee[]
): Promise<Winner> {
  if (prize.drawn >= prize.qty) {
    throw new Error('ของรางวัลรายการนี้ถูกสุ่มครบจำนวนแล้ว');
  }
  if (eligible.length === 0) {
    throw new Error('ไม่มีผู้เข้าเกณฑ์ที่ลงทะเบียนแล้วและยังไม่เคยได้รับรางวัล');
  }

  const randomArray = new Uint32Array(1);
  crypto.getRandomValues(randomArray);
  const picked = eligible[randomArray[0] % eligible.length];

  const winnerId = `win_${Date.now()}_${picked.id}`;
  const drawnAtStr = formatThaiDateTime(new Date());
  const drawnTimestamp = Date.now();

  const winnerObj: Winner = {
    id: winnerId,
    empId: picked.id,
    name: picked.fullName,
    inCharge: picked.inCharge,
    pos: picked.pos,
    table: picked.table,
    prizeId: prize.id,
    prizeName: prize.name,
    prizeImageUrl: prize.imageUrl,
    drawnAtStr,
    drawnTimestamp,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'winners', winnerId), {
    ...winnerObj,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'prizes', prize.id), {
    drawn: prize.drawn + 1,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'config', 'event_state'), {
    execReady: false,
    isRedrawActive: false,
    latestDrawId: winnerId,
    latestWinnerEmpId: picked.id,
    latestWinnerName: picked.fullName.slice(0, 180),
    latestWinnerInCharge: picked.inCharge.slice(0, 60),
    latestWinnerPos: picked.pos.slice(0, 80),
    latestWinnerTable: picked.table.slice(0, 30),
    latestWinnerPrize: prize.name.slice(0, 150),
    latestWinnerPrizeImage: prize.imageUrl.slice(0, 1000),
    latestDrawTimestamp: drawnTimestamp,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return winnerObj;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `winners/${winnerId}`);
  }
}

export async function redrawLatestWinner(
  latestWinner: Winner,
  prize: Prize | undefined
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'winners', latestWinner.id));
  if (prize && prize.drawn > 0) {
    batch.update(doc(db, 'prizes', prize.id), {
      drawn: prize.drawn - 1,
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(doc(db, 'config', 'event_state'), {
    execReady: true,
    isRedrawActive: true,
    latestDrawId: '',
    latestWinnerEmpId: '',
    latestWinnerName: '',
    latestWinnerInCharge: '',
    latestWinnerPos: '',
    latestWinnerTable: '',
    latestWinnerPrize: '',
    latestWinnerPrizeImage: '',
    latestDrawTimestamp: 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'winners');
  }
}

export async function resetAllLuckyDraws(
  winners: Winner[],
  prizes: Prize[]
): Promise<void> {
  const batch = writeBatch(db);
  winners.forEach((w) => {
    batch.delete(doc(db, 'winners', w.id));
  });
  prizes.forEach((p) => {
    batch.update(doc(db, 'prizes', p.id), {
      drawn: 0,
      updatedAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, 'config', 'event_state'), {
    execReady: false,
    isRedrawActive: false,
    latestDrawId: '',
    latestWinnerEmpId: '',
    latestWinnerName: '',
    latestWinnerInCharge: '',
    latestWinnerPos: '',
    latestWinnerTable: '',
    latestWinnerPrize: '',
    latestWinnerPrizeImage: '',
    latestDrawTimestamp: 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'winners');
  }
}
