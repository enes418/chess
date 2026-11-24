/**
 * Adversarial security specification tests for Chess Arena Firestore rules.
 * Designed to verify all 12 Dirty Dozen attack vectors return PERMISSION_DENIED
 * when executed against the Firebase Emulator Suite.
 */
export interface SecurityTestCase {
  id: string;
  description: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  { id: 'DD-01', description: 'Identity spoofing on players/{uid} create', collection: 'players', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-02', description: 'Shadow field isAdmin injection on players/{uid}', collection: 'players', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-03', description: 'Cross-user PII read on users/{otherUid}', collection: 'users', operation: 'get', expected: 'PERMISSION_DENIED' },
  { id: 'DD-04', description: 'Client-forged createdAt timestamp on games/{gameId}', collection: 'games', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-05', description: 'Array overflow (>500) on solvedPuzzleIds', collection: 'players', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-06', description: 'Path traversal / oversized ID poisoning', collection: 'rooms', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-07', description: 'Mutation of finished multiplayer room (terminal lock)', collection: 'rooms', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-08', description: 'Non-participant move injection in active room', collection: 'rooms', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-09', description: 'Guest overwriting hostId in room update', collection: 'rooms', operation: 'update', expected: 'PERMISSION_DENIED' },
  { id: 'DD-10', description: 'Unfiltered list scrape of games collection', collection: 'games', operation: 'list', expected: 'PERMISSION_DENIED' },
  { id: 'DD-11', description: 'Unverified email write attempt on rooms', collection: 'rooms', operation: 'create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-12', description: 'Type poisoning whiteTimeMs with string payload', collection: 'rooms', operation: 'update', expected: 'PERMISSION_DENIED' },
];
