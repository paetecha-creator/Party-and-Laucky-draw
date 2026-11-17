# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unmapped Firestore path is explicitly denied (`allow read, write: if false`).
2. **Admin Authority Isolation**: Only verified admin accounts (`ts.notify136@gmail.com` with `email_verified == true` or documents registered in `/admins/{uid}`) may modify `/config/event_state`, `/prizes`, `/winners`, `/admins`, or perform bulk employee imports/deletes.
3. **Terminal State Locking on Self Check-In**: Unauthenticated or guest check-in updates on `/employees/{empId}` are ONLY permitted when `/config/event_state.sysOpen == true`, `existing().registered == false`, transitioning `registered` to `true`, and `affectedKeys().hasOnly(['registered', 'regTimeStr', 'regTimestamp', 'checkInOrder', 'hasPhoto', 'updatedAt'])`. Once `registered == true`, non-admins can never overwrite or reset the employee record.
4. **Check-in Photo Integrity**: `/checkins/{empId}` can only be created once per unregistered employee while `sysOpen == true` (or by an admin), enforces `photoDataUrl.size() <= 200000`, `createdAt == request.time`, and matches an existing employee document.
5. **Temporal Integrity & Strict Schema Keys**: All `createdAt`/`updatedAt` timestamps must equal `request.time`. All creations validate `hasAll` and `hasOnly` to reject ghost fields. All string fields enforce `.size()` upper bounds and IDs match `^[a-zA-Z0-9_\-]+$`.
6. **Zero PII Exposure**: Employee records store only work ID, name, department (`inCharge`), job title (`pos`), table number, and check-in status—never emails, phone numbers, or home addresses.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Shadow Field Injection on Employee Create**: Non-admin or admin attempts to write `{ ..., isSuperUser: true }` to `/employees/E001`.
2. **Unverified Admin Email Spoofing**: Request with `auth.token.email = "ts.notify136@gmail.com"` and `auth.token.email_verified = false` attempts write to `/config/event_state`.
3. **Self-Assigned Admin Escalation**: Regular user writes `/admins/<ownUid>` with `{ role: "super" }`.
4. **Registration While System Closed**: Guest attempts self check-in update on `/employees/7473` when `/config/event_state.sysOpen == false`.
5. **Terminal State Re-Registration Overwrite**: Guest attempts to update `/employees/15139` (already `registered: true`) to alter `checkInOrder` or `regTimestamp`.
6. **Immutable Field Tampering During Check-In**: Guest check-in update attempts to modify `table: "VIP1"` or `isProbation: false` alongside `registered: true`.
7. **ID Poisoning Attack**: Attempt to create `/prizes/A...<150 chars>...` or `/employees/bad$id!`.
8. **Denial-of-Wallet Oversized String**: Attempt to create `/checkins/7473` with `photoDataUrl` > 200,000 bytes or `name` > 180 chars.
9. **Client Timestamp Forgery**: Write payload sets `updatedAt` to a past timestamp instead of `request.time`.
10. **Unauthorized Prize/Winner Manipulation**: Non-admin attempts to create a fake document in `/winners/w1` or increment `qty` in `/prizes/p1`.
11. **Ghost Config Mutation**: Non-admin attempts to set `execReady: true` or remove their ID from `blockedIds` in `/config/event_state`.
12. **Check-in Photo for Non-Existent Employee**: Guest attempts to create `/checkins/FAKE999` where `/employees/FAKE999` does not exist.
