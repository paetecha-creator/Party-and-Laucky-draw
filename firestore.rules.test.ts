// Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
// Targets DRAFT_firestore.rules / firestore.rules invariants.

export interface DirtyDozenCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'create' | 'update' | 'delete' | 'get';
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const dirtyDozenTestCases: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Employee Create',
    targetPath: '/employees/E001',
    operation: 'create',
    payload: { id: 'E001', fullName: 'Test', registered: false, isProbation: false, isSuperUser: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoofing',
    targetPath: '/config/event_state',
    operation: 'update',
    payload: { sysOpen: false, auth: { email: 'ts.notify136@gmail.com', email_verified: false } },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Escalation',
    targetPath: '/admins/attackerUid',
    operation: 'create',
    payload: { uid: 'attackerUid', email: 'attacker@example.com', role: 'super' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Registration While System Closed',
    targetPath: '/employees/7473',
    operation: 'update',
    payload: { registered: true, regTimeStr: '18:00', regTimestamp: 1700000000, checkInOrder: 1, hasPhoto: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Terminal State Re-Registration Overwrite',
    targetPath: '/employees/15139',
    operation: 'update',
    payload: { registered: true, checkInOrder: 999 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable Field Tampering During Check-In',
    targetPath: '/employees/7473',
    operation: 'update',
    payload: { registered: true, table: 'VIP1', isProbation: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning Attack',
    targetPath: '/prizes/invalid$id!',
    operation: 'create',
    payload: { id: 'invalid$id!', name: 'iPhone', qty: 1, drawn: 0, order: 1 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Denial-of-Wallet Oversized String',
    targetPath: '/checkins/7473',
    operation: 'create',
    payload: { empId: '7473', photoDataUrl: 'x'.repeat(250000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    targetPath: '/prizes/p1',
    operation: 'create',
    payload: { id: 'p1', name: 'Gift', qty: 1, drawn: 0, order: 1, updatedAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unauthorized Winner Creation',
    targetPath: '/winners/w1',
    operation: 'create',
    payload: { id: 'w1', empId: '7473', name: 'Test', prizeId: 'p1', prizeName: 'Gift', drawnTimestamp: 1700000000 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Ghost Config Mutation',
    targetPath: '/config/event_state',
    operation: 'update',
    payload: { execReady: true, blockedIds: [] },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Check-in Photo for Non-Existent Employee',
    targetPath: '/checkins/FAKE999',
    operation: 'create',
    payload: { empId: 'FAKE999', photoDataUrl: 'data:image/jpeg;base64,abc' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
