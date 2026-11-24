import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { INITIAL_FEN } from './chessLogic';
import type {
  GameRecord,
  MultiplayerRoom,
  PlayerProfile,
  UserSettings,
} from '../types/chess';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export const DEFAULT_AVATARS = [
  '/src/assets/images/avatar_ai_master_1795539266931.jpg',
  '/src/assets/images/avatar_ai_tactician_1795539266510.jpg',
];

export async function ensurePlayerProfile(user: User): Promise<PlayerProfile> {
  const playerPath = `players/${user.uid}`;
  const settingsPath = `users/${user.uid}`;
  const playerRef = doc(db, 'players', user.uid);
  const settingsRef = doc(db, 'users', user.uid);

  let existingPlayer: PlayerProfile | null = null;
  try {
    const snap = await getDoc(playerRef);
    if (snap.exists()) {
      existingPlayer = snap.data() as PlayerProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, playerPath);
  }

  if (!existingPlayer) {
    const cleanName = (user.displayName || user.email?.split('@')[0] || 'Grandmaster')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .slice(0, 28) || 'Player';

    const newProfile: PlayerProfile = {
      uid: user.uid,
      username: cleanName,
      avatarUrl: user.photoURL || DEFAULT_AVATARS[0],
      elo: 1200,
      puzzleRating: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      solvedPuzzleIds: [],
      favoriteOpenings: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(playerRef, newProfile);
      existingPlayer = newProfile;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, playerPath);
    }
  }

  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 200),
        boardTheme: 'emerald',
        pieceSet: 'staunton',
        soundEnabled: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, settingsPath);
  }

  return existingPlayer!;
}

export async function updatePlayerProfile(
  uid: string,
  updates: Partial<
    Pick<
      PlayerProfile,
      | 'username'
      | 'avatarUrl'
      | 'elo'
      | 'puzzleRating'
      | 'gamesPlayed'
      | 'wins'
      | 'losses'
      | 'draws'
      | 'solvedPuzzleIds'
      | 'favoriteOpenings'
    >
  >,
): Promise<void> {
  const path = `players/${uid}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.username !== undefined) payload.username = updates.username.trim().slice(0, 32);
  if (updates.avatarUrl !== undefined) payload.avatarUrl = updates.avatarUrl.slice(0, 512);
  if (updates.elo !== undefined) payload.elo = Math.max(100, Math.min(3500, Math.round(updates.elo)));
  if (updates.puzzleRating !== undefined)
    payload.puzzleRating = Math.max(100, Math.min(3500, Math.round(updates.puzzleRating)));
  if (updates.gamesPlayed !== undefined) payload.gamesPlayed = Math.max(0, Math.round(updates.gamesPlayed));
  if (updates.wins !== undefined) payload.wins = Math.max(0, Math.round(updates.wins));
  if (updates.losses !== undefined) payload.losses = Math.max(0, Math.round(updates.losses));
  if (updates.draws !== undefined) payload.draws = Math.max(0, Math.round(updates.draws));
  if (updates.solvedPuzzleIds !== undefined)
    payload.solvedPuzzleIds = updates.solvedPuzzleIds.slice(0, 500);
  if (updates.favoriteOpenings !== undefined)
    payload.favoriteOpenings = updates.favoriteOpenings.slice(0, 20);

  try {
    await updateDoc(doc(db, 'players', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function loadPrivateSettings(uid: string): Promise<UserSettings | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      boardTheme: data.boardTheme || 'emerald',
      pieceSet: data.pieceSet || 'staunton',
      soundEnabled: data.soundEnabled ?? true,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePrivateSettings(uid: string, settings: UserSettings): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      boardTheme: settings.boardTheme,
      pieceSet: settings.pieceSet,
      soundEnabled: settings.soundEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveGameRecord(record: Omit<GameRecord, 'id' | 'createdAtMs'>): Promise<string> {
  const gameId = `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `games/${gameId}`;

  const docData: Record<string, unknown> = {
    ownerId: record.ownerId,
    participantIds: record.participantIds.slice(0, 2),
    mode: record.mode,
    whiteName: record.whiteName.slice(0, 64),
    blackName: record.blackName.slice(0, 64),
    whiteElo: Math.max(100, Math.min(3500, Math.round(record.whiteElo))),
    blackElo: Math.max(100, Math.min(3500, Math.round(record.blackElo))),
    playerColor: record.playerColor,
    result: record.result,
    termination: record.termination.slice(0, 64),
    openingName: record.openingName.slice(0, 120),
    pgn: record.pgn.slice(0, 20000),
    finalFen: record.finalFen.slice(0, 150),
    moveCount: Math.max(0, Math.round(record.moveCount)),
    eloDelta: Math.max(-200, Math.min(200, Math.round(record.eloDelta))),
    createdAt: serverTimestamp(),
  };

  if (typeof record.accuracyWhite === 'number') {
    docData.accuracyWhite = Math.max(0, Math.min(100, Math.round(record.accuracyWhite * 10) / 10));
  }
  if (typeof record.accuracyBlack === 'number') {
    docData.accuracyBlack = Math.max(0, Math.min(100, Math.round(record.accuracyBlack * 10) / 10));
  }

  try {
    await setDoc(doc(db, 'games', gameId), docData);
    return gameId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeRecentGames(
  uid: string,
  onGames: (games: GameRecord[]) => void,
): Unsubscribe {
  const path = 'games';
  const q = query(
    collection(db, 'games'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(25),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: GameRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const createdAtMs =
          data.createdAt && typeof data.createdAt.toMillis === 'function'
            ? data.createdAt.toMillis()
            : Date.now();
        return {
          id: d.id,
          ownerId: data.ownerId,
          participantIds: data.participantIds || [uid],
          mode: data.mode,
          whiteName: data.whiteName,
          blackName: data.blackName,
          whiteElo: data.whiteElo,
          blackElo: data.blackElo,
          playerColor: data.playerColor,
          result: data.result,
          termination: data.termination,
          openingName: data.openingName,
          pgn: data.pgn,
          finalFen: data.finalFen,
          moveCount: data.moveCount,
          accuracyWhite: data.accuracyWhite,
          accuracyBlack: data.accuracyBlack,
          eloDelta: data.eloDelta ?? 0,
          createdAtMs,
        };
      });
      onGames(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createMultiplayerRoom(
  host: PlayerProfile,
  hostColor: 'w' | 'b',
  timeControlSec: number,
  incrementSec: number,
): Promise<string> {
  const roomCode = generateRoomCode();
  const path = `rooms/${roomCode}`;
  const initialMs = timeControlSec * 1000;

  try {
    await setDoc(doc(db, 'rooms', roomCode), {
      roomCode,
      hostId: host.uid,
      hostName: host.username.slice(0, 64),
      hostElo: host.elo,
      guestId: null,
      guestName: null,
      guestElo: null,
      whiteId: hostColor === 'w' ? host.uid : null,
      blackId: hostColor === 'b' ? host.uid : null,
      status: 'waiting',
      fen: INITIAL_FEN,
      pgn: '',
      turn: 'w',
      lastMoveFrom: '',
      lastMoveTo: '',
      timeControlSec,
      incrementSec,
      whiteTimeMs: initialMs,
      blackTimeMs: initialMs,
      lastMoveAtMs: Date.now(),
      winner: null,
      termination: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roomCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function joinMultiplayerRoom(
  rawCode: string,
  guest: PlayerProfile,
): Promise<MultiplayerRoom> {
  const roomCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!roomCode || roomCode.length < 4) {
    throw new Error('Please enter a valid room code.');
  }
  const path = `rooms/${roomCode}`;
  const roomRef = doc(db, 'rooms', roomCode);

  let snap;
  try {
    snap = await getDoc(roomRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (!snap.exists()) {
    throw new Error(`Room "${roomCode}" was not found.`);
  }

  const data = snap.data() as MultiplayerRoom;
  if (data.hostId === guest.uid || data.guestId === guest.uid) {
    return data;
  }
  if (data.status !== 'waiting' || data.guestId) {
    throw new Error('This room is already full or has finished.');
  }

  const whiteId = data.whiteId || guest.uid;
  const blackId = data.blackId || guest.uid;
  const nowMs = Date.now();

  try {
    await updateDoc(roomRef, {
      guestId: guest.uid,
      guestName: guest.username.slice(0, 64),
      guestElo: guest.elo,
      whiteId,
      blackId,
      status: 'active',
      lastMoveAtMs: nowMs,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  return {
    ...data,
    guestId: guest.uid,
    guestName: guest.username,
    guestElo: guest.elo,
    whiteId,
    blackId,
    status: 'active',
    lastMoveAtMs: nowMs,
  };
}

export async function submitRoomMove(
  roomCode: string,
  payload: {
    fen: string;
    pgn: string;
    turn: 'w' | 'b';
    lastMoveFrom: string;
    lastMoveTo: string;
    whiteTimeMs: number;
    blackTimeMs: number;
    lastMoveAtMs: number;
    status: 'active' | 'finished';
    winner: 'w' | 'b' | 'draw' | null;
    termination: string | null;
  },
): Promise<void> {
  const path = `rooms/${roomCode}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      fen: payload.fen.slice(0, 150),
      pgn: payload.pgn.slice(0, 20000),
      turn: payload.turn,
      lastMoveFrom: payload.lastMoveFrom.slice(0, 4),
      lastMoveTo: payload.lastMoveTo.slice(0, 4),
      whiteTimeMs: Math.max(0, Math.round(payload.whiteTimeMs)),
      blackTimeMs: Math.max(0, Math.round(payload.blackTimeMs)),
      lastMoveAtMs: payload.lastMoveAtMs,
      status: payload.status,
      winner: payload.winner,
      termination: payload.termination ? payload.termination.slice(0, 64) : null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function finishRoomEarly(
  roomCode: string,
  current: MultiplayerRoom,
  winner: 'w' | 'b' | 'draw',
  termination: string,
): Promise<void> {
  const path = `rooms/${roomCode}`;
  try {
    if (current.status === 'waiting') {
      await updateDoc(doc(db, 'rooms', roomCode), {
        status: 'finished',
        termination: termination.slice(0, 64),
        updatedAt: serverTimestamp(),
      });
    } else if (current.status === 'active') {
      await updateDoc(doc(db, 'rooms', roomCode), {
        fen: current.fen,
        pgn: current.pgn,
        turn: current.turn,
        lastMoveFrom: current.lastMoveFrom,
        lastMoveTo: current.lastMoveTo,
        whiteTimeMs: current.whiteTimeMs,
        blackTimeMs: current.blackTimeMs,
        lastMoveAtMs: current.lastMoveAtMs,
        status: 'finished',
        winner,
        termination: termination.slice(0, 64),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeRoom(
  roomCode: string,
  onRoom: (room: MultiplayerRoom | null) => void,
): Unsubscribe {
  const path = `rooms/${roomCode}`;
  return onSnapshot(
    doc(db, 'rooms', roomCode),
    (snap) => {
      if (!snap.exists()) {
        onRoom(null);
        return;
      }
      onRoom(snap.data() as MultiplayerRoom);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}
