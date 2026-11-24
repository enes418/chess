# Chess Arena Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses and private preferences live exclusively in `users/{userId}` and are readable/writable only when `request.auth.uid == userId` with verified email. Public leaderboard/opponent info lives in `players/{userId}` with zero PII.
2. **Ownership & Identity Integrity**: Every `PlayerProfile`, `UserPrivateSettings`, `GameRecord`, and `MultiplayerRoom` enforces `uid` / `ownerId` / `hostId` matching `request.auth.uid` on creation and immutability on update.
3. **Action-Based Room Transitions**: `MultiplayerRoom` state transitions are partitioned into `join`, `move`, and `cancel` actions, each restricting mutated keys via `affectedKeys().hasOnly(...)`. Once `status == 'finished'`, all further updates are blocked (Terminal State Locking).
4. **Temporal & Volumetric Bounds**: Every `createdAt` and `updatedAt` timestamp must equal `request.time`. Every string and array enforces explicit `.size()` bounds.

## 2. The Dirty Dozen Adversarial Payloads
1. **Identity Spoofing on Player Create**: `{ uid: "other-user", username: "Attacker", ... }` -> DENIED (`uid != request.auth.uid`).
2. **Shadow Field Injection on Player**: `{ uid: "<self>", ..., isAdmin: true }` -> DENIED (`hasOnly` rejects ghost key).
3. **PII Snooping**: User B reads `/users/userA` -> DENIED (`request.auth.uid != userId`).
4. **Forged Timestamp on Game Create**: `{ ownerId: "<self>", ..., createdAt: "2020-01-01T00:00:00Z" }` -> DENIED (`createdAt != request.time`).
5. **Unbounded Array Exhaustion**: `solvedPuzzleIds` with > 500 entries -> DENIED (`size() <= 500`).
6. **Malicious ID Poisoning**: Document ID `../../etc/passwd` or 200-char string -> DENIED (`isValidId` fails).
7. **Post-Finish Room Tampering**: Updating `fen` or `winner` when `existing().status == 'finished'` -> DENIED (terminal lock).
8. **Third-Party Hijack of Active Room**: User C attempts to send a move in a room between Host A and Guest B -> DENIED (`uid` not host or guest).
9. **Room Host Overwrite**: Guest attempts to include `hostId` in update payload -> DENIED (`affectedKeys().hasOnly` blocks `hostId`).
10. **Blanket List Query Scraping on Games**: Listing `/games` without constraining `ownerId == request.auth.uid` -> DENIED (`resource.data.ownerId == request.auth.uid`).
11. **Unverified Email Write**: Account with `email_verified: false` attempts to create a room -> DENIED (`email_verified == true` required).
12. **Invalid Type Poisoning on Room**: Updating `whiteTimeMs` to a string `"999999"` -> DENIED (`isValidRoom` enforces `int`/`number`).
