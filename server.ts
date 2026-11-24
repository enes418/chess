import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess, type Square } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
function resolveDataDir(): string {
  const preferred = path.resolve(__dirname, '.data');
  try {
    if (!fs.existsSync(preferred)) {
      fs.mkdirSync(preferred, { recursive: true });
    }
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.resolve(os.tmpdir(), 'chess-arena-data');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}
const DATA_DIR = resolveDataDir();
const STORE_PATH = path.resolve(DATA_DIR, 'chess_arena_store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface StoredUser {
  uid: string;
  email: string;
  username: string;
  passwordHash: string;
  avatarUrl: string;
  elo: number;
  puzzleRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  solvedPuzzleIds: string[];
  favoriteOpenings: string[];
  friends?: string[];
  boardTheme: 'obsidian' | 'emerald' | 'walnut' | 'slate';
  pieceSet: 'staunton' | 'modern' | 'classic';
  soundEnabled: boolean;
  createdAtMs: number;
}

interface StoredGame {
  id: string;
  ownerId: string;
  participantIds: string[];
  mode: 'ai' | 'local' | 'online' | 'practice';
  whiteName: string;
  blackName: string;
  whiteElo: number;
  blackElo: number;
  playerColor: 'w' | 'b';
  result: '1-0' | '0-1' | '1/2-1/2';
  termination: string;
  openingName: string;
  pgn: string;
  finalFen: string;
  moveCount: number;
  accuracyWhite?: number;
  accuracyBlack?: number;
  eloDelta: number;
  createdAtMs: number;
}

interface StoredRoom {
  roomCode: string;
  hostId: string;
  hostName: string;
  hostElo: number;
  guestId: string | null;
  guestName: string | null;
  guestElo: number | null;
  whiteId: string | null;
  blackId: string | null;
  status: 'waiting' | 'active' | 'finished';
  fen: string;
  pgn: string;
  turn: 'w' | 'b';
  lastMoveFrom: string;
  lastMoveTo: string;
  timeControlSec: number;
  incrementSec: number;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAtMs: number;
  winner: 'w' | 'b' | 'draw' | null;
  termination: string | null;
}

interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  createdAtMs: number;
}

interface MatchChallenge {
  id: string;
  fromUid: string;
  toUid: string;
  timeControlSec: number;
  incrementSec: number;
  challengerColor: 'w' | 'b' | 'random';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  roomCode?: string;
  createdAtMs: number;
}

interface AdminAccount {
  username: string;
  passwordHash: string;
  claimedAtMs: number;
}

interface StoreData {
  users: Record<string, StoredUser>;
  games: StoredGame[];
  rooms: Record<string, StoredRoom>;
  friendRequests: FriendRequest[];
  challenges: MatchChallenge[];
  cheatEngineAllowed: boolean;
  adminAccount?: AdminAccount;
}

function loadStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      return {
        users: parsed.users || {},
        games: parsed.games || [],
        rooms: parsed.rooms || {},
        friendRequests: parsed.friendRequests || [],
        challenges: parsed.challenges || [],
        cheatEngineAllowed: parsed.cheatEngineAllowed !== false,
        adminAccount: parsed.adminAccount,
      };
    }
  } catch (err) {
    console.error('Veri dosyası okunamadı, yeni depo oluşturuluyor:', err);
  }
  return {
    users: {},
    games: [],
    rooms: {},
    friendRequests: [],
    challenges: [],
    cheatEngineAllowed: true,
  };
}

function saveStore(data: StoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Veri dosyası kaydedilemedi:', err);
  }
}

const store: StoreData = loadStore();
const sseSubscribers = new Map<string, Set<Response>>();
const sseTickets = new Map<string, { uid: string; roomCode: string; expiresAt: number }>();

const socialSubscribers = new Map<string, Set<Response>>();
const socialTickets = new Map<string, { uid: string; expiresAt: number }>();

function broadcastRoom(roomCode: string, room: StoredRoom): void {
  const subs = sseSubscribers.get(roomCode);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(room)}\n\n`;
  for (const res of subs) {
    try {
      res.write(payload);
    } catch {
      subs.delete(res);
    }
  }
}

function toPublicFriend(u: StoredUser) {
  return {
    uid: u.uid,
    username: u.username,
    avatarUrl: u.avatarUrl,
    elo: u.elo,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    role: (u.uid === 'admin_root' ? 'admin' : 'player') as 'player' | 'admin',
  };
}

function buildSocialState(uid: string) {
  const me = store.users[uid];
  const friendIds = Array.isArray(me?.friends) ? me.friends : [];
  const friends = friendIds
    .map((fid) => store.users[fid])
    .filter((u): u is StoredUser => Boolean(u))
    .map((u) => toPublicFriend(u));

  const incomingRequests = store.friendRequests
    .filter((r) => r.toUid === uid && store.users[r.fromUid] && store.users[r.toUid])
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => ({
      ...r,
      fromUser: toPublicFriend(store.users[r.fromUid]),
      toUser: toPublicFriend(store.users[r.toUid]),
    }));

  const outgoingRequests = store.friendRequests
    .filter((r) => r.fromUid === uid && store.users[r.fromUid] && store.users[r.toUid])
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => ({
      ...r,
      fromUser: toPublicFriend(store.users[r.fromUid]),
      toUser: toPublicFriend(store.users[r.toUid]),
    }));

  const incomingChallenges = store.challenges
    .filter(
      (c) =>
        c.toUid === uid &&
        c.status === 'pending' &&
        store.users[c.fromUid] &&
        store.users[c.toUid],
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((c) => ({
      ...c,
      fromUser: toPublicFriend(store.users[c.fromUid]),
      toUser: toPublicFriend(store.users[c.toUid]),
    }));

  const outgoingChallenges = store.challenges
    .filter(
      (c) =>
        c.fromUid === uid &&
        (c.status === 'pending' ||
          (c.status === 'accepted' &&
            Boolean(c.roomCode) &&
            store.rooms[c.roomCode!]?.status !== 'finished')) &&
        Date.now() - c.createdAtMs < 1000 * 60 * 15 &&
        store.users[c.fromUid] &&
        store.users[c.toUid],
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((c) => ({
      ...c,
      fromUser: toPublicFriend(store.users[c.fromUid]),
      toUser: toPublicFriend(store.users[c.toUid]),
    }));

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    incomingChallenges,
    outgoingChallenges,
  };
}

function broadcastSocial(uids: string[]): void {
  const unique = Array.from(new Set(uids));
  for (const uid of unique) {
    const subs = socialSubscribers.get(uid);
    if (!subs || subs.size === 0) continue;
    const state = buildSocialState(uid);
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    for (const res of subs) {
      try {
        res.write(payload);
      } catch {
        subs.delete(res);
      }
    }
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signToken(uid: string, role: 'player' | 'admin' = 'player'): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 gün
  const payloadB64 = Buffer.from(JSON.stringify({ uid, role, exp }), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyToken(token: string): { uid: string; role: 'player' | 'admin' } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid: string;
      role?: 'player' | 'admin';
      exp: number;
    };
    if (!parsed.uid || Date.now() > parsed.exp) return null;
    return { uid: parsed.uid, role: parsed.role === 'admin' ? 'admin' : 'player' };
  } catch {
    return null;
  }
}

function safeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function ensureAdminProfileUser(username: string): StoredUser {
  const existing = store.users['admin_root'];
  if (existing) {
    existing.username = username;
    return existing;
  }
  const adminUser: StoredUser = {
    uid: 'admin_root',
    email: 'admin@chessarena.local',
    username,
    passwordHash: '',
    avatarUrl: '/src/assets/images/avatar_ai_master_1795539266931.jpg',
    elo: 1500,
    puzzleRating: 1500,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    solvedPuzzleIds: [],
    favoriteOpenings: [],
    friends: [],
    boardTheme: 'emerald',
    pieceSet: 'staunton',
    soundEnabled: true,
    createdAtMs: Date.now(),
  };
  store.users['admin_root'] = adminUser;
  return adminUser;
}

function toPublicProfile(u: StoredUser, role: 'player' | 'admin' = 'player') {
  return {
    uid: u.uid,
    username: u.username,
    role,
    avatarUrl: u.avatarUrl,
    elo: u.elo,
    puzzleRating: u.puzzleRating,
    gamesPlayed: u.gamesPlayed,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    solvedPuzzleIds: u.solvedPuzzleIds,
    favoriteOpenings: u.favoriteOpenings,
  };
}

function toSettings(u: StoredUser) {
  return {
    boardTheme: u.boardTheme,
    pieceSet: u.pieceSet,
    soundEnabled: u.soundEnabled,
  };
}

interface AuthedRequest extends Request {
  userId?: string;
  userRole?: 'player' | 'admin';
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Kimlik doğrulama gerekli.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const claims = verifyToken(token);
  if (!claims || !store.users[claims.uid]) {
    res.status(401).json({ error: 'Oturum süresi doldu veya geçersiz. Lütfen tekrar giriş yapın.' });
    return;
  }
  req.userId = claims.uid;
  req.userRole = claims.role;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.userRole !== 'admin' || req.userId !== 'admin_root') {
      res.status(403).json({ error: 'Yönetici (Admin) yetkisi gerekli.' });
      return;
    }
    next();
  });
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return store.rooms[code] ? generateRoomCode() : code;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Site içi kayıt
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const avatarUrl =
      typeof body.avatarUrl === 'string' && body.avatarUrl.startsWith('/src/assets/images/')
        ? body.avatarUrl.slice(0, 200)
        : '/src/assets/images/avatar_ai_tactician_1795539266510.jpg';

    if (username.length < 2 || username.length > 32) {
      res.status(400).json({ error: 'Kullanıcı adı 2 ile 32 karakter arasında olmalıdır.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
      res.status(400).json({ error: 'Lütfen geçerli bir e-posta adresi girin.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Şifre en az 6 karakter uzunluğunda olmalıdır.' });
      return;
    }

    const reservedAdminName = (
      process.env.ADMIN_USERNAME ||
      store.adminAccount?.username ||
      ''
    )
      .trim()
      .toLowerCase();

    const existingList = Object.values(store.users);
    if (existingList.some((u) => u.email === email)) {
      res.status(409).json({ error: 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.' });
      return;
    }
    if (
      existingList.some((u) => u.username.toLowerCase() === username.toLowerCase()) ||
      (reservedAdminName && username.toLowerCase() === reservedAdminName)
    ) {
      res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
      return;
    }

    const uid = `usr_${crypto.randomBytes(10).toString('hex')}`;
    const newUser: StoredUser = {
      uid,
      email,
      username,
      passwordHash: hashPassword(password),
      avatarUrl,
      elo: 1200,
      puzzleRating: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      solvedPuzzleIds: [],
      favoriteOpenings: [],
      friends: [],
      boardTheme: 'emerald',
      pieceSet: 'staunton',
      soundEnabled: true,
      createdAtMs: Date.now(),
    };

    store.users[uid] = newUser;
    saveStore(store);

    const token = signToken(uid);
    res.status(201).json({
      token,
      profile: toPublicProfile(newUser),
      settings: toSettings(newUser),
      games: [],
    });
  });

  // Site içi giriş
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Lütfen e-posta/kullanıcı adı ve şifrenizi girin.' });
      return;
    }

    const user = Object.values(store.users).find(
      (u) => u.email === identifier || u.username.toLowerCase() === identifier,
    );

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Giriş bilgileri hatalı. Kullanıcı adı/e-posta ve şifrenizi kontrol edin.' });
      return;
    }

    const token = signToken(user.uid, 'player');
    const games = store.games
      .filter((g) => g.ownerId === user.uid)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 30);

    res.json({
      token,
      profile: toPublicProfile(user, 'player'),
      settings: toSettings(user),
      games,
    });
  });

  // Admin Durumu
  app.get('/api/admin/status', (_req: Request, res: Response) => {
    const envPass = (process.env.ADMIN_PASSCODE || '').trim();
    const envConfigured = envPass.length > 0;
    const claimed = Boolean(store.adminAccount);
    res.json({
      configured: envConfigured || claimed,
      needsClaim: !envConfigured && !claimed,
      envOverride: envConfigured,
    });
  });

  // İlk Kurulum Admin Sahiplenme
  app.post('/api/admin/claim', (req: Request, res: Response) => {
    const envPass = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPass.length > 0 || store.adminAccount) {
      res.status(409).json({ error: 'Admin hesabı zaten yapılandırılmış.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length < 2 || username.length > 32) {
      res.status(400).json({ error: 'Admin kullanıcı adı 2 ile 32 karakter arasında olmalıdır.' });
      return;
    }
    if (password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'Admin şifresi en az 4 karakter olmalıdır.' });
      return;
    }

    store.adminAccount = {
      username,
      passwordHash: hashPassword(password),
      claimedAtMs: Date.now(),
    };
    const adminUser = ensureAdminProfileUser(username);
    saveStore(store);

    const token = signToken('admin_root', 'admin');
    res.status(201).json({
      token,
      profile: toPublicProfile(adminUser, 'admin'),
      settings: toSettings(adminUser),
      games: [],
      cheatEngineAllowed: store.cheatEngineAllowed !== false,
    });
  });

  // Admin Girişi
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Lütfen admin kullanıcı adı ve şifresini girin.' });
      return;
    }

    const envPass = (process.env.ADMIN_PASSCODE || '').trim();
    const envUser = (process.env.ADMIN_USERNAME || 'admin').trim();

    let authorized = false;
    let resolvedUsername = username;

    if (envPass.length > 0) {
      if (
        username.toLowerCase() === envUser.toLowerCase() &&
        safeEqualStrings(password, envPass)
      ) {
        authorized = true;
        resolvedUsername = envUser;
      }
    } else if (store.adminAccount) {
      if (
        username.toLowerCase() === store.adminAccount.username.toLowerCase() &&
        verifyPassword(password, store.adminAccount.passwordHash)
      ) {
        authorized = true;
        resolvedUsername = store.adminAccount.username;
      }
    } else {
      res.status(400).json({ error: 'Admin hesabı henüz kurulmamış. Önce yönetici hesabını oluşturun.' });
      return;
    }

    if (!authorized) {
      res.status(401).json({ error: 'Admin kullanıcı adı veya şifre hatalı.' });
      return;
    }

    const adminUser = ensureAdminProfileUser(resolvedUsername);
    saveStore(store);

    const token = signToken('admin_root', 'admin');
    const games = store.games
      .filter((g) => g.ownerId === adminUser.uid)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 30);

    res.json({
      token,
      profile: toPublicProfile(adminUser, 'admin'),
      settings: toSettings(adminUser),
      games,
      cheatEngineAllowed: store.cheatEngineAllowed !== false,
    });
  });

  // Korumalı Admin Genel Bakış & Moderasyon Rotaları
  app.get('/api/admin/overview', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const players = Object.values(store.users).map((u) =>
      toPublicProfile(u, u.uid === 'admin_root' ? 'admin' : 'player'),
    );
    const rooms = Object.values(store.rooms);
    const recentGames = [...store.games]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 40);

    res.json({
      totalUsers: players.length,
      totalGames: store.games.length,
      activeRoomsCount: rooms.filter((r) => r.status !== 'finished').length,
      cheatEngineAllowed: store.cheatEngineAllowed !== false,
      players,
      rooms,
      recentGames,
    });
  });

  // Satranç Hile Motoru Genel Açma/Kapama (Sadece Admin)
  app.patch('/api/admin/cheat-engine', requireAdmin, (req: AuthedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ error: 'Geçerli bir boolean "enabled" değeri gerekli.' });
      return;
    }
    store.cheatEngineAllowed = body.enabled;
    saveStore(store);
    res.json({ cheatEngineAllowed: store.cheatEngineAllowed });
  });

  app.post('/api/admin/rooms/:code/close', requireAdmin, (req: AuthedRequest, res: Response) => {
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const room = store.rooms[roomCode];
    if (!room) {
      res.status(404).json({ error: 'Oda bulunamadı.' });
      return;
    }
    room.status = 'finished';
    room.termination = 'Yönetici Tarafından Kapatıldı';
    if (room.guestId && !room.winner) {
      room.winner = 'draw';
    }
    saveStore(store);
    broadcastRoom(roomCode, room);
    res.json({ room });
  });

  app.patch('/api/admin/players/:uid/elo', requireAdmin, (req: AuthedRequest, res: Response) => {
    const target = store.users[req.params.uid];
    if (!target) {
      res.status(404).json({ error: 'Oyuncu bulunamadı.' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    if (typeof body.elo !== 'number' || !Number.isFinite(body.elo)) {
      res.status(400).json({ error: 'Geçerli bir sayısal ELO puanı girin.' });
      return;
    }
    target.elo = Math.max(100, Math.min(3500, Math.round(body.elo)));
    saveStore(store);
    res.json({ profile: toPublicProfile(target, target.uid === 'admin_root' ? 'admin' : 'player') });
  });

  app.delete('/api/admin/games/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const before = store.games.length;
    store.games = store.games.filter((g) => g.id !== req.params.id);
    if (store.games.length === before) {
      res.status(404).json({ error: 'Maç kaydı bulunamadı.' });
      return;
    }
    saveStore(store);
    res.json({ deleted: true });
  });

  // Mevcut kullanıcı oturum kontrolü
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = store.users[req.userId!];
    const games = store.games
      .filter((g) => g.ownerId === user.uid)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 30);

    res.json({
      profile: toPublicProfile(user, req.userRole || 'player'),
      settings: toSettings(user),
      games,
      ...(req.userRole === 'admin' ? { cheatEngineAllowed: store.cheatEngineAllowed !== false } : {}),
    });
  });

  // Profil güncelleme
  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;

    if (typeof body.username === 'string') {
      const clean = body.username.trim();
      if (clean.length < 2 || clean.length > 32) {
        res.status(400).json({ error: 'Kullanıcı adı 2 ile 32 karakter arasında olmalıdır.' });
        return;
      }
      const reservedAdmin = (
        process.env.ADMIN_USERNAME ||
        store.adminAccount?.username ||
        ''
      )
        .trim()
        .toLowerCase();
      const conflict = Object.values(store.users).some(
        (u) => u.uid !== user.uid && u.username.toLowerCase() === clean.toLowerCase(),
      );
      if (
        conflict ||
        (req.userId !== 'admin_root' && reservedAdmin && clean.toLowerCase() === reservedAdmin)
      ) {
        res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanımda.' });
        return;
      }
      user.username = clean;
    }
    if (typeof body.avatarUrl === 'string' && body.avatarUrl.startsWith('/src/assets/images/')) {
      user.avatarUrl = body.avatarUrl.slice(0, 200);
    }
    if (typeof body.elo === 'number' && Number.isFinite(body.elo)) {
      user.elo = Math.max(100, Math.min(3500, Math.round(body.elo)));
    }
    if (typeof body.puzzleRating === 'number' && Number.isFinite(body.puzzleRating)) {
      user.puzzleRating = Math.max(100, Math.min(3500, Math.round(body.puzzleRating)));
    }
    if (typeof body.gamesPlayed === 'number' && body.gamesPlayed >= 0) {
      user.gamesPlayed = Math.round(body.gamesPlayed);
    }
    if (typeof body.wins === 'number' && body.wins >= 0) {
      user.wins = Math.round(body.wins);
    }
    if (typeof body.losses === 'number' && body.losses >= 0) {
      user.losses = Math.round(body.losses);
    }
    if (typeof body.draws === 'number' && body.draws >= 0) {
      user.draws = Math.round(body.draws);
    }
    if (Array.isArray(body.solvedPuzzleIds)) {
      user.solvedPuzzleIds = body.solvedPuzzleIds
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 500);
    }
    if (Array.isArray(body.favoriteOpenings)) {
      user.favoriteOpenings = body.favoriteOpenings
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 20);
    }

    saveStore(store);
    res.json({ profile: toPublicProfile(user, req.userRole || 'player') });
  });

  // Ayarları güncelleme
  app.put('/api/settings', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const validThemes = ['obsidian', 'emerald', 'walnut', 'slate'];
    const validPieces = ['staunton', 'modern', 'classic'];

    if (typeof body.boardTheme === 'string' && validThemes.includes(body.boardTheme)) {
      user.boardTheme = body.boardTheme as StoredUser['boardTheme'];
    }
    if (typeof body.pieceSet === 'string' && validPieces.includes(body.pieceSet)) {
      user.pieceSet = body.pieceSet as StoredUser['pieceSet'];
    }
    if (typeof body.soundEnabled === 'boolean') {
      user.soundEnabled = body.soundEnabled;
    }

    saveStore(store);
    res.json({ settings: toSettings(user) });
  });

  // Tamamlanan maçı kaydet
  app.post('/api/games', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const validModes = ['ai', 'local', 'online', 'practice'];
    const validResults = ['1-0', '0-1', '1/2-1/2'];

    const mode = typeof body.mode === 'string' && validModes.includes(body.mode) ? body.mode : 'ai';
    const result =
      typeof body.result === 'string' && validResults.includes(body.result) ? body.result : '1/2-1/2';

    const game: StoredGame = {
      id: `gm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      ownerId: user.uid,
      participantIds: [user.uid],
      mode: mode as StoredGame['mode'],
      whiteName: typeof body.whiteName === 'string' ? body.whiteName.slice(0, 64) : 'Beyaz',
      blackName: typeof body.blackName === 'string' ? body.blackName.slice(0, 64) : 'Siyah',
      whiteElo:
        typeof body.whiteElo === 'number' && Number.isFinite(body.whiteElo)
          ? Math.max(100, Math.min(3500, Math.round(body.whiteElo)))
          : 1200,
      blackElo:
        typeof body.blackElo === 'number' && Number.isFinite(body.blackElo)
          ? Math.max(100, Math.min(3500, Math.round(body.blackElo)))
          : 1200,
      playerColor: body.playerColor === 'b' ? 'b' : 'w',
      result: result as StoredGame['result'],
      termination: typeof body.termination === 'string' ? body.termination.slice(0, 64) : 'Tamamlandı',
      openingName: typeof body.openingName === 'string' ? body.openingName.slice(0, 120) : 'Açılış',
      pgn: typeof body.pgn === 'string' ? body.pgn.slice(0, 20000) : '',
      finalFen: typeof body.finalFen === 'string' ? body.finalFen.slice(0, 150) : INITIAL_FEN,
      moveCount: typeof body.moveCount === 'number' ? Math.max(0, Math.round(body.moveCount)) : 0,
      eloDelta:
        typeof body.eloDelta === 'number' && Number.isFinite(body.eloDelta)
          ? Math.max(-200, Math.min(200, Math.round(body.eloDelta)))
          : 0,
      createdAtMs: Date.now(),
    };

    store.games.unshift(game);
    if (store.games.length > 500) {
      store.games = store.games.slice(0, 500);
    }
    saveStore(store);
    res.status(201).json({ game });
  });

  // --- Arkadaşlar & VS Daveti (Sosyal Rotalar) ---
  app.post('/api/social/ticket', requireAuth, (req: AuthedRequest, res: Response) => {
    const ticket = crypto.randomBytes(24).toString('hex');
    socialTickets.set(ticket, {
      uid: req.userId!,
      expiresAt: Date.now() + 30000,
    });
    res.json({ ticket });
  });

  app.get('/api/social/stream', (req: Request, res: Response) => {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const info = socialTickets.get(ticket);
    if (!info || Date.now() > info.expiresAt) {
      res.status(401).json({ error: 'Sosyal bildirim bileti geçersiz veya süresi dolmuş.' });
      return;
    }
    socialTickets.delete(ticket);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!socialSubscribers.has(info.uid)) {
      socialSubscribers.set(info.uid, new Set());
    }
    socialSubscribers.get(info.uid)!.add(res);
    res.write(`data: ${JSON.stringify(buildSocialState(info.uid))}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      socialSubscribers.get(info.uid)?.delete(res);
    });
  });

  app.get('/api/social/state', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json(buildSocialState(req.userId!));
  });

  app.get('/api/social/search', requireAuth, (req: AuthedRequest, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const meUid = req.userId!;
    const matches = Object.values(store.users)
      .filter((u) => {
        if (u.uid === meUid) return false;
        if (!q) return true;
        return u.username.toLowerCase().includes(q);
      })
      .slice(0, 15)
      .map((u) => toPublicFriend(u));

    res.json({ players: matches });
  });

  app.post('/api/friends/request', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const targetUid = typeof body.targetUid === 'string' ? body.targetUid.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';

    const target = targetUid
      ? store.users[targetUid]
      : Object.values(store.users).find((u) => u.username.toLowerCase() === username);

    if (!target) {
      res.status(404).json({ error: 'Oyuncu bulunamadı.' });
      return;
    }
    if (target.uid === me.uid) {
      res.status(400).json({ error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' });
      return;
    }

    const myFriends = Array.isArray(me.friends) ? me.friends : [];
    if (myFriends.includes(target.uid)) {
      res.status(409).json({ error: 'Bu oyuncu zaten arkadaş listenizde.' });
      return;
    }

    // Karşı taraf zaten istek göndermişse otomatik arkadaş yap
    const reverseReqIdx = store.friendRequests.findIndex(
      (r) => r.fromUid === target.uid && r.toUid === me.uid,
    );
    if (reverseReqIdx !== -1) {
      store.friendRequests.splice(reverseReqIdx, 1);
      me.friends = Array.from(new Set([...(me.friends || []), target.uid]));
      target.friends = Array.from(new Set([...(target.friends || []), me.uid]));
      saveStore(store);
      broadcastSocial([me.uid, target.uid]);
      res.json({ status: 'accepted' });
      return;
    }

    const alreadySent = store.friendRequests.some(
      (r) => r.fromUid === me.uid && r.toUid === target.uid,
    );
    if (alreadySent) {
      res.status(409).json({ error: 'Bu oyuncuya zaten bekleyen bir arkadaşlık isteğiniz var.' });
      return;
    }

    const requestItem: FriendRequest = {
      id: `fr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      fromUid: me.uid,
      toUid: target.uid,
      createdAtMs: Date.now(),
    };
    store.friendRequests.push(requestItem);
    saveStore(store);
    broadcastSocial([me.uid, target.uid]);
    res.status(201).json({ status: 'sent' });
  });

  app.post('/api/friends/respond', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const action = body.action === 'accept' || body.action === 'decline' ? body.action : null;

    if (!requestId || !action) {
      res.status(400).json({ error: 'Geçersiz istek parametreleri.' });
      return;
    }

    const idx = store.friendRequests.findIndex((r) => r.id === requestId);
    if (idx === -1) {
      res.status(404).json({ error: 'Arkadaşlık isteği bulunamadı.' });
      return;
    }
    const reqItem = store.friendRequests[idx];
    if (reqItem.toUid !== me.uid) {
      res.status(403).json({ error: 'Bu arkadaşlık isteğini yanıtlama yetkiniz yok.' });
      return;
    }

    store.friendRequests.splice(idx, 1);
    const sender = store.users[reqItem.fromUid];
    if (action === 'accept' && sender) {
      me.friends = Array.from(new Set([...(me.friends || []), sender.uid]));
      sender.friends = Array.from(new Set([...(sender.friends || []), me.uid]));
    }

    saveStore(store);
    broadcastSocial([me.uid, reqItem.fromUid]);
    res.json({ ok: true });
  });

  app.delete('/api/friends/:uid', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = store.users[req.userId!];
    const targetUid = req.params.uid;
    const target = store.users[targetUid];

    me.friends = (me.friends || []).filter((id) => id !== targetUid);
    if (target) {
      target.friends = (target.friends || []).filter((id) => id !== me.uid);
    }

    // Aradaki bekleyen VS davetlerini temizle
    store.challenges = store.challenges.map((c) => {
      if (
        c.status === 'pending' &&
        ((c.fromUid === me.uid && c.toUid === targetUid) ||
          (c.fromUid === targetUid && c.toUid === me.uid))
      ) {
        return { ...c, status: 'cancelled' };
      }
      return c;
    });

    saveStore(store);
    broadcastSocial([me.uid, targetUid]);
    res.json({ ok: true });
  });

  app.post('/api/challenges', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const toUid = typeof body.toUid === 'string' ? body.toUid.trim() : '';
    const target = store.users[toUid];

    if (!target) {
      res.status(404).json({ error: 'Davet edilecek arkadaş bulunamadı.' });
      return;
    }
    if (target.uid === me.uid) {
      res.status(400).json({ error: 'Kendinize VS daveti gönderemezsiniz.' });
      return;
    }
    if (!Array.isArray(me.friends) || !me.friends.includes(target.uid)) {
      res.status(403).json({ error: 'VS daveti gönderebilmek için önce arkadaş olmalısınız.' });
      return;
    }

    const existingPending = store.challenges.find(
      (c) => c.fromUid === me.uid && c.toUid === target.uid && c.status === 'pending',
    );
    if (existingPending) {
      res.status(409).json({ error: 'Bu arkadaşınıza zaten bekleyen bir VS davetiniz var.' });
      return;
    }

    const timeControlSec =
      typeof body.timeControlSec === 'number'
        ? Math.max(60, Math.min(7200, Math.round(body.timeControlSec)))
        : 600;
    const incrementSec =
      typeof body.incrementSec === 'number'
        ? Math.max(0, Math.min(60, Math.round(body.incrementSec)))
        : 0;
    const challengerColor =
      body.challengerColor === 'w' || body.challengerColor === 'b' ? body.challengerColor : 'random';

    const challenge: MatchChallenge = {
      id: `ch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      fromUid: me.uid,
      toUid: target.uid,
      timeControlSec,
      incrementSec,
      challengerColor,
      status: 'pending',
      createdAtMs: Date.now(),
    };

    store.challenges.push(challenge);
    if (store.challenges.length > 200) {
      store.challenges = store.challenges.slice(-200);
    }
    saveStore(store);
    broadcastSocial([me.uid, target.uid]);

    res.status(201).json({
      challenge: {
        ...challenge,
        fromUser: toPublicFriend(me),
        toUser: toPublicFriend(target),
      },
    });
  });

  app.post('/api/challenges/:id/respond', requireAuth, (req: AuthedRequest, res: Response) => {
    const me = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const action =
      body.action === 'accept' || body.action === 'decline' || body.action === 'cancel'
        ? body.action
        : null;

    if (!action) {
      res.status(400).json({ error: 'Geçersiz davet yanıtı.' });
      return;
    }

    const challenge = store.challenges.find((c) => c.id === req.params.id);
    if (!challenge) {
      res.status(404).json({ error: 'VS daveti bulunamadı.' });
      return;
    }
    if (challenge.status !== 'pending') {
      res.status(409).json({ error: 'Bu VS daveti artık geçerli değil.' });
      return;
    }

    if ((action === 'accept' || action === 'decline') && challenge.toUid !== me.uid) {
      res.status(403).json({ error: 'Bu VS davetini yalnızca davet edilen oyuncu yanıtlayabilir.' });
      return;
    }
    if (action === 'cancel' && challenge.fromUid !== me.uid) {
      res.status(403).json({ error: 'Bu daveti yalnızca gönderen iptal edebilir.' });
      return;
    }

    const fromUser = store.users[challenge.fromUid];
    const toUser = store.users[challenge.toUid];
    if (!fromUser || !toUser) {
      res.status(404).json({ error: 'Davet oyuncuları bulunamadı.' });
      return;
    }

    let createdRoom: StoredRoom | undefined;

    if (action === 'accept') {
      const challengerPlaysWhite =
        challenge.challengerColor === 'w'
          ? true
          : challenge.challengerColor === 'b'
            ? false
            : Math.random() < 0.5;
      const roomCode = generateRoomCode();
      const initialMs = challenge.timeControlSec * 1000;

      createdRoom = {
        roomCode,
        hostId: fromUser.uid,
        hostName: fromUser.username,
        hostElo: fromUser.elo,
        guestId: toUser.uid,
        guestName: toUser.username,
        guestElo: toUser.elo,
        whiteId: challengerPlaysWhite ? fromUser.uid : toUser.uid,
        blackId: challengerPlaysWhite ? toUser.uid : fromUser.uid,
        status: 'active',
        fen: INITIAL_FEN,
        pgn: '',
        turn: 'w',
        lastMoveFrom: '',
        lastMoveTo: '',
        timeControlSec: challenge.timeControlSec,
        incrementSec: challenge.incrementSec,
        whiteTimeMs: initialMs,
        blackTimeMs: initialMs,
        lastMoveAtMs: Date.now(),
        winner: null,
        termination: null,
      };
      store.rooms[roomCode] = createdRoom;
      challenge.status = 'accepted';
      challenge.roomCode = roomCode;
    } else if (action === 'decline') {
      challenge.status = 'declined';
    } else {
      challenge.status = 'cancelled';
    }

    saveStore(store);
    broadcastSocial([fromUser.uid, toUser.uid]);

    res.json({
      challenge: {
        ...challenge,
        fromUser: toPublicFriend(fromUser),
        toUser: toPublicFriend(toUser),
      },
      room: createdRoom,
    });
  });

  // Çevrimiçi özel oda oluştur
  app.post('/api/rooms', requireAuth, (req: AuthedRequest, res: Response) => {
    const host = store.users[req.userId!];
    const body = req.body as Record<string, unknown>;
    const hostColor = body.hostColor === 'b' ? 'b' : 'w';
    const timeControlSec =
      typeof body.timeControlSec === 'number'
        ? Math.max(60, Math.min(7200, Math.round(body.timeControlSec)))
        : 600;
    const incrementSec =
      typeof body.incrementSec === 'number'
        ? Math.max(0, Math.min(60, Math.round(body.incrementSec)))
        : 0;

    const roomCode = generateRoomCode();
    const initialMs = timeControlSec * 1000;
    const room: StoredRoom = {
      roomCode,
      hostId: host.uid,
      hostName: host.username,
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
    };

    store.rooms[roomCode] = room;
    saveStore(store);
    res.status(201).json({ room });
  });

  // Çevrimiçi odaya katıl
  app.post('/api/rooms/:code/join', requireAuth, (req: AuthedRequest, res: Response) => {
    const guest = store.users[req.userId!];
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const room = store.rooms[roomCode];

    if (!room) {
      res.status(404).json({ error: `"${roomCode}" kodlu oda bulunamadı.` });
      return;
    }

    if (room.hostId === guest.uid || room.guestId === guest.uid) {
      res.json({ room });
      return;
    }

    if (room.status !== 'waiting' || room.guestId) {
      res.status(409).json({ error: 'Bu oda dolu veya maç sona ermiş.' });
      return;
    }

    room.guestId = guest.uid;
    room.guestName = guest.username;
    room.guestElo = guest.elo;
    if (!room.whiteId) room.whiteId = guest.uid;
    if (!room.blackId) room.blackId = guest.uid;
    room.status = 'active';
    room.lastMoveAtMs = Date.now();

    saveStore(store);
    broadcastRoom(roomCode, room);
    res.json({ room });
  });

  // Tek kullanımlık SSE oda bileti
  app.post('/api/rooms/:code/ticket', requireAuth, (req: AuthedRequest, res: Response) => {
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const room = store.rooms[roomCode];
    if (!room) {
      res.status(404).json({ error: 'Oda bulunamadı.' });
      return;
    }
    if (room.hostId !== req.userId && room.guestId !== req.userId) {
      res.status(403).json({ error: 'Bu odanın katılımcısı değilsiniz.' });
      return;
    }
    const ticket = crypto.randomBytes(24).toString('hex');
    sseTickets.set(ticket, {
      uid: req.userId!,
      roomCode,
      expiresAt: Date.now() + 30000,
    });
    res.json({ ticket });
  });

  // Gerçek zamanlı oda SSE akışı
  app.get('/api/rooms/:code/stream', (req: Request, res: Response) => {
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const info = sseTickets.get(ticket);

    if (!info || info.roomCode !== roomCode || Date.now() > info.expiresAt) {
      res.status(401).json({ error: 'Oda akış bileti geçersiz veya süresi dolmuş.' });
      return;
    }
    sseTickets.delete(ticket);

    const room = store.rooms[roomCode];
    if (!room) {
      res.status(404).json({ error: 'Oda bulunamadı.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseSubscribers.has(roomCode)) {
      sseSubscribers.set(roomCode, new Set());
    }
    sseSubscribers.get(roomCode)!.add(res);
    res.write(`data: ${JSON.stringify(room)}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseSubscribers.get(roomCode)?.delete(res);
    });
  });

  // Sunucu doğrulamalı hamle gönderimi
  app.post('/api/rooms/:code/move', requireAuth, (req: AuthedRequest, res: Response) => {
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const room = store.rooms[roomCode];
    if (!room) {
      res.status(404).json({ error: 'Oda bulunamadı.' });
      return;
    }
    if (room.status !== 'active') {
      res.status(409).json({ error: 'Oda şu anda aktif değil.' });
      return;
    }
    const expectedPlayerId = room.turn === 'w' ? room.whiteId : room.blackId;
    if (req.userId !== expectedPlayerId) {
      res.status(403).json({ error: 'Sıra sizde değil.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const from = typeof body.from === 'string' ? (body.from as Square) : ('' as Square);
    const to = typeof body.to === 'string' ? (body.to as Square) : ('' as Square);
    const promotion =
      body.promotion === 'q' || body.promotion === 'r' || body.promotion === 'b' || body.promotion === 'n'
        ? body.promotion
        : undefined;

    const chess = new Chess();
    try {
      if (room.pgn) chess.loadPgn(room.pgn);
      else chess.load(room.fen);
    } catch {
      chess.load(room.fen);
    }

    const moved = chess.move({ from, to, promotion });
    if (!moved) {
      res.status(400).json({ error: 'Kurallara uygun olmayan hamle.' });
      return;
    }

    const nowMs = Date.now();
    const elapsed = Math.max(0, nowMs - room.lastMoveAtMs);
    const incMs = room.incrementSec * 1000;

    if (moved.color === 'w') {
      room.whiteTimeMs = Math.max(0, room.whiteTimeMs - elapsed) + incMs;
    } else {
      room.blackTimeMs = Math.max(0, room.blackTimeMs - elapsed) + incMs;
    }

    room.fen = chess.fen();
    room.pgn = chess.pgn();
    room.turn = chess.turn();
    room.lastMoveFrom = moved.from;
    room.lastMoveTo = moved.to;
    room.lastMoveAtMs = nowMs;

    if (chess.isCheckmate()) {
      room.status = 'finished';
      room.winner = moved.color;
      room.termination = 'Şah Mat';
    } else if (
      chess.isDraw() ||
      chess.isStalemate() ||
      chess.isThreefoldRepetition() ||
      chess.isInsufficientMaterial()
    ) {
      room.status = 'finished';
      room.winner = 'draw';
      room.termination = chess.isStalemate()
        ? 'Pat'
        : chess.isThreefoldRepetition()
          ? 'Üç Kez Konum Tekrarı'
          : chess.isInsufficientMaterial()
            ? 'Yetersiz Materyal'
            : '50 Hamle Kuralı Beraberliği';
    }

    saveStore(store);
    broadcastRoom(roomCode, room);
    res.json({ room });
  });

  // Odayı erken bitir (Terk / Süre Doldu / İptal)
  app.post('/api/rooms/:code/finish', requireAuth, (req: AuthedRequest, res: Response) => {
    const roomCode = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const room = store.rooms[roomCode];
    if (!room) {
      res.status(404).json({ error: 'Oda bulunamadı.' });
      return;
    }
    if (room.hostId !== req.userId && room.guestId !== req.userId) {
      res.status(403).json({ error: 'Bu odanın katılımcısı değilsiniz.' });
      return;
    }
    if (room.status === 'finished') {
      res.json({ room });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const termination =
      typeof body.termination === 'string' ? body.termination.slice(0, 64) : 'Tamamlandı';
    const winner =
      body.winner === 'w' || body.winner === 'b' || body.winner === 'draw' ? body.winner : 'draw';

    room.status = 'finished';
    room.termination = termination;
    if (room.guestId) {
      room.winner = winner;
    }

    saveStore(store);
    broadcastRoom(roomCode, room);
    res.json({ room });
  });

  // Vite geliştirme ara katmanı veya üretim statik dosyaları
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chess Arena sunucusu http://0.0.0.0:${PORT} adresinde çalışıyor`);
  });
}

void startServer();
