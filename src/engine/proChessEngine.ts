// Pure TypeScript 0x88 Pro Satranç Motoru (Web Worker uyumlu, sıfır dış bağımlılık)

export const MATE_SCORE = 30000;
export const MATE_THRESHOLD = 29000;

// Taş sabitleri: Beyaz 1..6, Siyah 9..14 (bit 3 = renk: 0 beyaz, 8 siyah; alt 3 bit = tip)
const EMPTY = 0;
const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
const BP = 9, BN = 10, BB = 11, BR = 12, BQ = 13, BK = 14;

const PIECE_TYPE_MASK = 7;
const BLACK_BIT = 8;

const P_PAWN = 1;
const P_KNIGHT = 2;
const P_BISHOP = 3;
const P_ROOK = 4;
const P_QUEEN = 5;
const P_KING = 6;

const FILES = 'abcdefgh';

// Taş hareket ofsetleri (0x88 koordinat sistemi: üst nibble satır 0..7 -> rank 8..1, alt nibble sütun 0..7 -> file a..h)
const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_OFFSETS = [-17, -15, 15, 17];
const ROOK_OFFSETS = [-16, -1, 1, 16];
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];

// Rok hakları bit maskeleri
const WK_CASTLE = 1;
const WQ_CASTLE = 2;
const BK_CASTLE = 4;
const BQ_CASTLE = 8;

// Hamle paketleme:
// bit 0..6: from (0..127)
// bit 7..13: to (0..127)
// bit 14..17: captured piece (0..14)
// bit 18..20: promotion type (0 veya 2..5)
// bit 21: isEnPassant
// bit 22: isCastle
// bit 23: isDoublePush
const MOVE_FROM_MASK = 0x7f;
const MOVE_TO_SHIFT = 7;
const MOVE_CAP_SHIFT = 14;
const MOVE_PROMO_SHIFT = 18;
const MOVE_EP_FLAG = 1 << 21;
const MOVE_CASTLE_FLAG = 1 << 22;
const MOVE_DPUSH_FLAG = 1 << 23;

function encodeMove(
  from: number,
  to: number,
  captured = 0,
  promo = 0,
  flags = 0,
): number {
  return (
    from |
    (to << MOVE_TO_SHIFT) |
    (captured << MOVE_CAP_SHIFT) |
    (promo << MOVE_PROMO_SHIFT) |
    flags
  );
}

export function sq0x88ToAlg(sq: number): string {
  const rank = 8 - (sq >> 4);
  const file = sq & 7;
  return `${FILES[file]}${rank}`;
}

export function algTo0x88(alg: string): number {
  const file = FILES.indexOf(alg[0]);
  const rank = 8 - parseInt(alg[1], 10);
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return (rank << 4) | file;
}

export function moveToUci(move: number): string {
  const from = move & MOVE_FROM_MASK;
  const to = (move >> MOVE_TO_SHIFT) & 0x7f;
  const promo = (move >> MOVE_PROMO_SHIFT) & 7;
  const promoMap = ['', '', 'n', 'b', 'r', 'q'];
  return `${sq0x88ToAlg(from)}${sq0x88ToAlg(to)}${promo ? promoMap[promo] : ''}`;
}

// Tapered PeSTO değerlendirme tabloları (Beyaz bakış açısı, row 0 = 8. yatay)
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const SEE_VALUE = [0, 100, 320, 335, 500, 950, 20000];

const MG_PAWN_PST = [
   0,   0,   0,   0,   0,   0,   0,   0,
  98, 134,  61,  95,  68, 126,  34, -11,
  -6,   7,  26,  31,  65,  56,  25, -20,
 -14,  13,   6,  21,  23,  12,  17, -23,
 -27,  -2,  -5,  12,  17,   6,  10, -25,
 -26,  -4,  -4, -10,   3,   3,  33, -12,
 -35,  -1, -20, -23, -15,  24,  38, -22,
   0,   0,   0,   0,   0,   0,   0,   0,
];

const EG_PAWN_PST = [
   0,   0,   0,   0,   0,   0,   0,   0,
 178, 173, 158, 134, 147, 132, 165, 187,
  94, 100,  85,  67,  56,  53,  82,  84,
  32,  24,  13,   5,  -2,   4,  17,  17,
  13,   9,  -3,  -7,  -7,  -8,   3,  -1,
   4,   7,  -6,   1,   0,  -5,  -1,  -8,
  13,   8,   8,  10,  13,   0,   2,  -7,
   0,   0,   0,   0,   0,   0,   0,   0,
];

const MG_KNIGHT_PST = [
 -167, -89, -34, -49,  61, -97, -15, -107,
  -73, -41,  72,  36,  23,  62,   7,  -17,
  -47,  60,  37,  65,  84, 129,  73,   44,
   -9,  17,  19,  53,  37,  69,  18,   22,
  -13,   4,  16,  13,  28,  19,  21,   -8,
  -23,  -9,  12,  10,  19,  17,  25,  -16,
  -29, -53, -12,  -3,  -1,  18, -14,  -19,
 -105, -21, -58, -33, -17, -28, -19,  -23,
];

const EG_KNIGHT_PST = [
 -58, -38, -13, -28, -31, -27, -63, -99,
 -25,  -8, -25,  -2,  -9, -25, -24, -52,
 -24, -20,  10,   9,  -1,  -9, -19, -41,
 -17,   3,  22,  22,  22,  11,   8, -18,
 -18,  -6,  16,  25,  16,  17,   4, -18,
 -23,  -3,  -1,  15,  10,  -3, -20, -22,
 -42, -20, -10,  -5,  -2, -20, -23, -44,
 -29, -51, -23, -15, -22, -18, -50, -64,
];

const MG_BISHOP_PST = [
 -29,   4, -82, -37, -25, -42,   7,  -8,
 -26,  16, -18, -13,  30,  59,  18, -47,
 -16,  37,  43,  40,  35,  50,  37,  -2,
  -4,   5,  19,  50,  37,  37,   7,  -2,
  -6,  13,  13,  26,  34,  12,  10,   4,
   0,  15,  15,  15,  14,  27,  18,  10,
   4,  15,  16,   0,   7,  21,  33,   1,
 -33,  -3, -14, -21, -13, -12, -39, -21,
];

const EG_BISHOP_PST = [
 -14, -21, -11,  -8,  -7,  -9, -17, -24,
  -8,  -4,   7, -12,  -3, -13,  -4, -14,
   2,  -8,   0,  -1,  -2,   6,   0,   4,
  -3,   9,  12,   9,  14,  10,   3,   2,
  -6,   3,  13,  19,   7,  10,  -3,  -9,
 -12,  -3,   8,  10,  13,   3,  -7, -15,
 -14, -18,  -7,  -1,   4,  -9, -15, -27,
 -23,  -9, -23,  -5,  -9, -16,  -5, -17,
];

const MG_ROOK_PST = [
  32,  42,  32,  51, 63,  9,  31,  43,
  27,  32,  58,  62, 80, 67,  26,  44,
  -5,  19,  26,  36, 17, 45,  61,  16,
 -24, -11,   7,  26, 24, 35,  -8, -20,
 -36, -26, -12,  -1,  9, -7,   6, -23,
 -45, -25, -16, -17,  3,  0,  -5, -33,
 -44, -16, -20,  -9, -1, 11,  -6, -71,
 -19, -13,   1,  17, 16,  7, -37, -26,
];

const EG_ROOK_PST = [
  13, 10, 18, 15, 12,  12,   8,   5,
  11, 13, 13, 11, -3,   3,   8,   3,
   7,  7,  7,  5,  4,  -3,  -5,  -3,
   4,  3, 13,  1,  2,   1,  -1,   2,
   3,  5,  8,  4, -5,  -6,  -8, -11,
  -4,  0, -5, -1, -7, -12,  -8, -16,
  -6, -6,  0,  2, -9,  -9, -11,  -3,
  -9,  2,  3, -1, -5, -13,   4, -20,
];

const MG_QUEEN_PST = [
 -28,   0,  29,  12,  59,  44,  43,  45,
 -24, -39,  -5,   1, -16,  57,  28,  54,
 -13, -17,   7,   8,  29,  56,  47,  57,
 -27, -27, -16, -16,  -1,  17,  -2,   1,
  -9, -26,  -9, -10,  -2,  -4,   3,  -3,
 -14,   2, -11,  -2,  -5,   2,  14,   5,
 -35,  -8,  11,   2,   8,  15,  -3,   1,
  -1, -18,  -9,  10, -15, -25, -31, -50,
];

const EG_QUEEN_PST = [
  -9,  22,  22,  27,  27,  19,  10,  20,
 -17,  20,  32,  41,  58,  25,  30,   0,
 -20,   6,   9,  49,  47,  35,  19,   9,
   3,  22,  24,  45,  57,  40,  57,  36,
 -18,  28,  19,  47,  31,  34,  39,  23,
 -16, -27,  15,   6,   9,  17,  10,   5,
 -22, -23, -30, -16, -16, -23, -36, -32,
 -33, -28, -22, -43,  -5, -32, -20, -41,
];

const MG_KING_PST = [
 -65,  23,  16, -15, -56, -34,   2,  13,
  29,  -1, -20,  -7,  -8,  -4, -38, -29,
  -9,  24,   2, -16, -20,   6,  22, -22,
 -17, -20, -12, -27, -30, -25, -14, -36,
 -49,  -1, -27, -39, -46, -44, -33, -51,
 -14, -14, -22, -46, -44, -30, -15, -27,
   1,   7,  -8, -64, -43, -16,   9,   8,
 -15,  36,  12, -54,   8, -28,  24,  14,
];

const EG_KING_PST = [
 -74, -35, -18, -18, -11,  15,   4, -17,
 -12,  17,  14,  17,  17,  38,  23,  11,
  10,  17,  23,  15,  20,  45,  44,  13,
  -8,  22,  24,  27,  26,  33,  26,   3,
 -18,  -4,  21,  24,  27,  23,   9, -11,
 -19,  -3,  11,  21,  23,  16,   7,  -9,
 -27, -11,   4,  13,  14,   4,  -5, -17,
 -53, -33, -21, -10, -10, -17, -25, -48,
];

const MG_PSTS = [null, MG_PAWN_PST, MG_KNIGHT_PST, MG_BISHOP_PST, MG_ROOK_PST, MG_QUEEN_PST, MG_KING_PST];
const EG_PSTS = [null, EG_PAWN_PST, EG_KNIGHT_PST, EG_BISHOP_PST, EG_ROOK_PST, EG_QUEEN_PST, EG_KING_PST];

// Zobrist deterministik PRNG
let seedState = 0x9e3779b9;
function nextRand32(): number {
  let x = seedState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  seedState = x >>> 0;
  return seedState;
}

// 15 taş tipi x 64 kare (h1 ve h2)
const Z_PIECE_1 = new Uint32Array(16 * 64);
const Z_PIECE_2 = new Uint32Array(16 * 64);
for (let i = 0; i < 16 * 64; i++) {
  Z_PIECE_1[i] = nextRand32();
  Z_PIECE_2[i] = nextRand32();
}
const Z_TURN_1 = nextRand32();
const Z_TURN_2 = nextRand32();
const Z_CASTLE_1 = new Uint32Array(16);
const Z_CASTLE_2 = new Uint32Array(16);
for (let i = 0; i < 16; i++) {
  Z_CASTLE_1[i] = nextRand32();
  Z_CASTLE_2[i] = nextRand32();
}
const Z_EP_1 = new Uint32Array(9);
const Z_EP_2 = new Uint32Array(9);
for (let i = 0; i < 9; i++) {
  Z_EP_1[i] = nextRand32();
  Z_EP_2[i] = nextRand32();
}

// Transposition Table (2^17 = 131,072 slot -> hızlı ve bellek dostu)
const TT_BITS = 17;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

// Küçük yerleşik Usta Açılış Kitabı (sadeleştirilmiş FEN anahtarı -> önerilen UCI hamleleri)
const OPENING_BOOK: Record<string, string[]> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq': ['c7c5', 'e7e5', 'e7e6', 'c7c6'],
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': ['g8f6', 'd7d5', 'e7e6'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['g1f3', 'f1c4', 'b1c3'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['b8c6', 'g8f6'],
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': ['f1b5', 'f1c4', 'd2d4'],
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['a7a6', 'g8f6'],
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -': ['f8c5', 'g8f6'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['g1f3', 'b1c3', 'c2c3'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': ['d7d6', 'b8c6', 'e7e6'],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': ['c2c4', 'g1f3', 'c1f4'],
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': ['e7e6', 'c7c6', 'd5c4'],
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -': ['c2c4', 'g1f3', 'c1f4'],
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -': ['e7e6', 'g7g6', 'c7c5'],
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4', 'd2d3'],
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': ['d2d4', 'b1c3'],
};

function bookKeyFromFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  // ep yoksa '-' ile biten ilk 4 parça; ep varsa ilk 3 parça eşleşmesine de bakılır
  return `${parts[0]} ${parts[1]} ${parts[2]}`;
}

export interface SearchOptions {
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
  skillLevel?: number; // 0..20
}

export interface RawEngineLine {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  mate: number | null;
  pvUci: string[];
}

export interface RawSearchSnapshot {
  fen: string;
  depth: number;
  nodes: number;
  lines: RawEngineLine[];
  bestMoveUci: string | null;
  insight: string | null;
}

interface UndoState {
  castle: number;
  epSquare: number;
  halfmove: number;
  h1: number;
  h2: number;
  wKingSq: number;
  bKingSq: number;
}

export class ProChessEngine {
  public board = new Int8Array(128);
  public turn: 0 | 8 = 0; // 0 = beyaz, 8 = siyah
  public castle = 0;
  public epSquare = -1;
  public halfmove = 0;
  public wKingSq = 0x74;
  public bKingSq = 0x04;
  public h1 = 0;
  public h2 = 0;

  // Arama durumları
  private ttKey1 = new Uint32Array(TT_SIZE);
  private ttKey2 = new Uint32Array(TT_SIZE);
  private ttDepth = new Int8Array(TT_SIZE);
  private ttFlag = new Uint8Array(TT_SIZE);
  private ttScore = new Int32Array(TT_SIZE);
  private ttMove = new Int32Array(TT_SIZE);

  private killer1 = new Int32Array(128);
  private killer2 = new Int32Array(128);
  private history = new Int32Array(2 * 128 * 128);
  private moveBuf = new Int32Array(128 * 256); // ply başına max 256 sahte-yasal hamle
  private undoStack: UndoState[] = [];
  private hashHistory: number[] = []; // tekrar kontrolü için h1^h2 listesi

  public nodes = 0;
  private startTime = 0;
  private timeBudgetMs = 1000;
  private stopRequested = false;

  public loadFen(fen: string): boolean {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return false;

    this.board.fill(EMPTY);
    this.wKingSq = -1;
    this.bKingSq = -1;

    const rows = parts[0].split('/');
    if (rows.length !== 8) return false;

    const charToPiece: Record<string, number> = {
      P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK,
      p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK,
    };

    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += parseInt(ch, 10);
        } else {
          const piece = charToPiece[ch];
          if (!piece || c > 7) return false;
          const sq = (r << 4) | c;
          this.board[sq] = piece;
          if (piece === WK) this.wKingSq = sq;
          if (piece === BK) this.bKingSq = sq;
          c++;
        }
      }
      if (c !== 8) return false;
    }

    if (this.wKingSq < 0 || this.bKingSq < 0) return false;

    this.turn = parts[1] === 'b' ? BLACK_BIT : 0;

    let cRights = 0;
    if (parts[2].includes('K')) cRights |= WK_CASTLE;
    if (parts[2].includes('Q')) cRights |= WQ_CASTLE;
    if (parts[2].includes('k')) cRights |= BK_CASTLE;
    if (parts[2].includes('q')) cRights |= BQ_CASTLE;
    this.castle = cRights;

    this.epSquare = parts[3] && parts[3] !== '-' ? algTo0x88(parts[3]) : -1;
    this.halfmove = parts[4] ? Math.max(0, parseInt(parts[4], 10) || 0) : 0;
    this.undoStack = [];
    this.hashHistory = [];
    this.recomputeHash();
    this.hashHistory.push((this.h1 ^ this.h2) >>> 0);
    return true;
  }

  private recomputeHash(): void {
    let h1 = 0;
    let h2 = 0;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq0x88 = (r << 4) | f;
        const p = this.board[sq0x88];
        if (p !== EMPTY) {
          const idx = (p << 6) | (r << 3) | f;
          h1 ^= Z_PIECE_1[idx];
          h2 ^= Z_PIECE_2[idx];
        }
      }
    }
    if (this.turn === BLACK_BIT) {
      h1 ^= Z_TURN_1;
      h2 ^= Z_TURN_2;
    }
    h1 ^= Z_CASTLE_1[this.castle];
    h2 ^= Z_CASTLE_2[this.castle];
    const epIdx = this.epSquare >= 0 ? (this.epSquare & 7) + 1 : 0;
    h1 ^= Z_EP_1[epIdx];
    h2 ^= Z_EP_2[epIdx];
    this.h1 = h1 >>> 0;
    this.h2 = h2 >>> 0;
  }

  private sqIdx64(sq: number): number {
    return ((sq >> 4) << 3) | (sq & 7);
  }

  public isSquareAttacked(sq: number, byColor: number): boolean {
    const bd = this.board;
    // Piyon saldırıları
    if (byColor === 0) {
      const p1 = sq + 15;
      const p2 = sq + 17;
      if ((p1 & 0x88) === 0 && bd[p1] === WP) return true;
      if ((p2 & 0x88) === 0 && bd[p2] === WP) return true;
    } else {
      const p1 = sq - 15;
      const p2 = sq - 17;
      if ((p1 & 0x88) === 0 && bd[p1] === BP) return true;
      if ((p2 & 0x88) === 0 && bd[p2] === BP) return true;
    }

    // At saldırıları
    const targetKnight = byColor | P_KNIGHT;
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_OFFSETS[i];
      if ((t & 0x88) === 0 && bd[t] === targetKnight) return true;
    }

    // Şah saldırıları
    const targetKing = byColor | P_KING;
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_OFFSETS[i];
      if ((t & 0x88) === 0 && bd[t] === targetKing) return true;
    }

    // Çapraz saldırılar (Fil & Vezir)
    const targetBishop = byColor | P_BISHOP;
    const targetQueen = byColor | P_QUEEN;
    for (let i = 0; i < 4; i++) {
      const off = BISHOP_OFFSETS[i];
      let t = sq + off;
      while ((t & 0x88) === 0) {
        const p = bd[t];
        if (p !== EMPTY) {
          if (p === targetBishop || p === targetQueen) return true;
          break;
        }
        t += off;
      }
    }

    // Düz saldırılar (Kale & Vezir)
    const targetRook = byColor | P_ROOK;
    for (let i = 0; i < 4; i++) {
      const off = ROOK_OFFSETS[i];
      let t = sq + off;
      while ((t & 0x88) === 0) {
        const p = bd[t];
        if (p !== EMPTY) {
          if (p === targetRook || p === targetQueen) return true;
          break;
        }
        t += off;
      }
    }

    return false;
  }

  public inCheck(color = this.turn): boolean {
    const kSq = color === 0 ? this.wKingSq : this.bKingSq;
    return this.isSquareAttacked(kSq, color ^ BLACK_BIT);
  }

  // Sahte-yasal hamle üretimi; return değeri moveBuf içindeki bitiş indeksi
  public generatePseudoMoves(ply: number, capturesOnly = false): number {
    let idx = ply << 8;
    const buf = this.moveBuf;
    const bd = this.board;
    const us = this.turn;
    const them = us ^ BLACK_BIT;

    for (let r = 0; r < 8; r++) {
      const rowBase = r << 4;
      for (let f = 0; f < 8; f++) {
        const sq = rowBase | f;
        const p = bd[sq];
        if (p === EMPTY || (p & BLACK_BIT) !== us) continue;

        const pt = p & PIECE_TYPE_MASK;

        if (pt === P_PAWN) {
          const dir = us === 0 ? -16 : 16;
          const startRank = us === 0 ? 6 : 1;
          const promoRank = us === 0 ? 0 : 7;

          // İleri hamleler
          const one = sq + dir;
          if ((one & 0x88) === 0 && bd[one] === EMPTY) {
            const toRank = one >> 4;
            if (toRank === promoRank) {
              buf[idx++] = encodeMove(sq, one, 0, P_QUEEN);
              buf[idx++] = encodeMove(sq, one, 0, P_ROOK);
              buf[idx++] = encodeMove(sq, one, 0, P_BISHOP);
              buf[idx++] = encodeMove(sq, one, 0, P_KNIGHT);
            } else if (!capturesOnly) {
              buf[idx++] = encodeMove(sq, one);
              if (r === startRank) {
                const two = one + dir;
                if (bd[two] === EMPTY) {
                  buf[idx++] = encodeMove(sq, two, 0, 0, MOVE_DPUSH_FLAG);
                }
              }
            }
          }

          // Çapraz alışlar ve geçerken alma (en passant)
          for (const capOff of [dir - 1, dir + 1]) {
            const to = sq + capOff;
            if ((to & 0x88) !== 0) continue;
            const target = bd[to];
            if (target !== EMPTY && (target & BLACK_BIT) === them) {
              const toRank = to >> 4;
              if (toRank === promoRank) {
                buf[idx++] = encodeMove(sq, to, target, P_QUEEN);
                buf[idx++] = encodeMove(sq, to, target, P_ROOK);
                buf[idx++] = encodeMove(sq, to, target, P_BISHOP);
                buf[idx++] = encodeMove(sq, to, target, P_KNIGHT);
              } else {
                buf[idx++] = encodeMove(sq, to, target);
              }
            } else if (to === this.epSquare && this.epSquare >= 0) {
              const epCapPiece = them | P_PAWN;
              buf[idx++] = encodeMove(sq, to, epCapPiece, 0, MOVE_EP_FLAG);
            }
          }
        } else if (pt === P_KNIGHT) {
          for (let i = 0; i < 8; i++) {
            const to = sq + KNIGHT_OFFSETS[i];
            if ((to & 0x88) !== 0) continue;
            const target = bd[to];
            if (target === EMPTY) {
              if (!capturesOnly) buf[idx++] = encodeMove(sq, to);
            } else if ((target & BLACK_BIT) === them) {
              buf[idx++] = encodeMove(sq, to, target);
            }
          }
        } else if (pt === P_KING) {
          for (let i = 0; i < 8; i++) {
            const to = sq + KING_OFFSETS[i];
            if ((to & 0x88) !== 0) continue;
            const target = bd[to];
            if (target === EMPTY) {
              if (!capturesOnly) buf[idx++] = encodeMove(sq, to);
            } else if ((target & BLACK_BIT) === them) {
              buf[idx++] = encodeMove(sq, to, target);
            }
          }

          // Rok hakları
          if (!capturesOnly) {
            if (us === 0 && sq === 0x74) {
              if (
                (this.castle & WK_CASTLE) !== 0 &&
                bd[0x75] === EMPTY &&
                bd[0x76] === EMPTY &&
                bd[0x77] === WR &&
                !this.isSquareAttacked(0x74, BLACK_BIT) &&
                !this.isSquareAttacked(0x75, BLACK_BIT) &&
                !this.isSquareAttacked(0x76, BLACK_BIT)
              ) {
                buf[idx++] = encodeMove(0x74, 0x76, 0, 0, MOVE_CASTLE_FLAG);
              }
              if (
                (this.castle & WQ_CASTLE) !== 0 &&
                bd[0x73] === EMPTY &&
                bd[0x72] === EMPTY &&
                bd[0x71] === EMPTY &&
                bd[0x70] === WR &&
                !this.isSquareAttacked(0x74, BLACK_BIT) &&
                !this.isSquareAttacked(0x73, BLACK_BIT) &&
                !this.isSquareAttacked(0x72, BLACK_BIT)
              ) {
                buf[idx++] = encodeMove(0x74, 0x72, 0, 0, MOVE_CASTLE_FLAG);
              }
            } else if (us === BLACK_BIT && sq === 0x04) {
              if (
                (this.castle & BK_CASTLE) !== 0 &&
                bd[0x05] === EMPTY &&
                bd[0x06] === EMPTY &&
                bd[0x07] === BR &&
                !this.isSquareAttacked(0x04, 0) &&
                !this.isSquareAttacked(0x05, 0) &&
                !this.isSquareAttacked(0x06, 0)
              ) {
                buf[idx++] = encodeMove(0x04, 0x06, 0, 0, MOVE_CASTLE_FLAG);
              }
              if (
                (this.castle & BQ_CASTLE) !== 0 &&
                bd[0x03] === EMPTY &&
                bd[0x02] === EMPTY &&
                bd[0x01] === EMPTY &&
                bd[0x00] === BR &&
                !this.isSquareAttacked(0x04, 0) &&
                !this.isSquareAttacked(0x03, 0) &&
                !this.isSquareAttacked(0x02, 0)
              ) {
                buf[idx++] = encodeMove(0x04, 0x02, 0, 0, MOVE_CASTLE_FLAG);
              }
            }
          }
        } else {
          // Kayan taşlar (Fil, Kale, Vezir)
          const offsets =
            pt === P_BISHOP
              ? BISHOP_OFFSETS
              : pt === P_ROOK
                ? ROOK_OFFSETS
                : KING_OFFSETS;
          for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i];
            let to = sq + off;
            while ((to & 0x88) === 0) {
              const target = bd[to];
              if (target === EMPTY) {
                if (!capturesOnly) buf[idx++] = encodeMove(sq, to);
              } else {
                if ((target & BLACK_BIT) === them) {
                  buf[idx++] = encodeMove(sq, to, target);
                }
                break;
              }
              to += off;
            }
          }
        }
      }
    }

    return idx;
  }

  public makeMove(move: number): boolean {
    const from = move & MOVE_FROM_MASK;
    const to = (move >> MOVE_TO_SHIFT) & 0x7f;
    const captured = (move >> MOVE_CAP_SHIFT) & 0xf;
    const promo = (move >> MOVE_PROMO_SHIFT) & 7;
    const isEp = (move & MOVE_EP_FLAG) !== 0;
    const isCastle = (move & MOVE_CASTLE_FLAG) !== 0;
    const isDpush = (move & MOVE_DPUSH_FLAG) !== 0;

    const us = this.turn;
    const bd = this.board;
    const piece = bd[from];

    this.undoStack.push({
      castle: this.castle,
      epSquare: this.epSquare,
      halfmove: this.halfmove,
      h1: this.h1,
      h2: this.h2,
      wKingSq: this.wKingSq,
      bKingSq: this.bKingSq,
    });

    let h1 = this.h1;
    let h2 = this.h2;

    // Eski EP & rok & sıra hash kaldır
    const oldEpIdx = this.epSquare >= 0 ? (this.epSquare & 7) + 1 : 0;
    h1 ^= Z_EP_1[oldEpIdx];
    h2 ^= Z_EP_2[oldEpIdx];
    h1 ^= Z_CASTLE_1[this.castle];
    h2 ^= Z_CASTLE_2[this.castle];
    h1 ^= Z_TURN_1;
    h2 ^= Z_TURN_2;

    const from64 = this.sqIdx64(from);
    const to64 = this.sqIdx64(to);

    // Başlangıç taşını kaldır
    h1 ^= Z_PIECE_1[(piece << 6) | from64];
    h2 ^= Z_PIECE_2[(piece << 6) | from64];
    bd[from] = EMPTY;

    // Alınan taşı kaldır
    if (captured !== EMPTY) {
      if (isEp) {
        const capSq = us === 0 ? to + 16 : to - 16;
        const cap64 = this.sqIdx64(capSq);
        h1 ^= Z_PIECE_1[(captured << 6) | cap64];
        h2 ^= Z_PIECE_2[(captured << 6) | cap64];
        bd[capSq] = EMPTY;
      } else {
        h1 ^= Z_PIECE_1[(captured << 6) | to64];
        h2 ^= Z_PIECE_2[(captured << 6) | to64];
      }
    }

    // Hedefe taşı koy (terfi varsa yeni taş)
    const placed = promo ? us | promo : piece;
    bd[to] = placed;
    h1 ^= Z_PIECE_1[(placed << 6) | to64];
    h2 ^= Z_PIECE_2[(placed << 6) | to64];

    if (piece === WK) this.wKingSq = to;
    else if (piece === BK) this.bKingSq = to;

    // Rok kalesini taşı
    if (isCastle) {
      let rFrom = 0;
      let rTo = 0;
      let rook = WR;
      if (to === 0x76) { rFrom = 0x77; rTo = 0x75; rook = WR; }
      else if (to === 0x72) { rFrom = 0x70; rTo = 0x73; rook = WR; }
      else if (to === 0x06) { rFrom = 0x07; rTo = 0x05; rook = BR; }
      else { rFrom = 0x00; rTo = 0x03; rook = BR; }

      const rf64 = this.sqIdx64(rFrom);
      const rt64 = this.sqIdx64(rTo);
      h1 ^= Z_PIECE_1[(rook << 6) | rf64] ^ Z_PIECE_1[(rook << 6) | rt64];
      h2 ^= Z_PIECE_2[(rook << 6) | rf64] ^ Z_PIECE_2[(rook << 6) | rt64];
      bd[rFrom] = EMPTY;
      bd[rTo] = rook;
    }

    // Rok haklarını güncelle
    let nextCastle = this.castle;
    if (from === 0x74) nextCastle &= ~(WK_CASTLE | WQ_CASTLE);
    else if (from === 0x04) nextCastle &= ~(BK_CASTLE | BQ_CASTLE);
    if (from === 0x77 || to === 0x77) nextCastle &= ~WK_CASTLE;
    if (from === 0x70 || to === 0x70) nextCastle &= ~WQ_CASTLE;
    if (from === 0x07 || to === 0x07) nextCastle &= ~BK_CASTLE;
    if (from === 0x00 || to === 0x00) nextCastle &= ~BQ_CASTLE;
    this.castle = nextCastle;

    // Yeni EP karesi
    this.epSquare = isDpush ? (us === 0 ? to + 16 : to - 16) : -1;

    // Yarım hamle sayacı
    this.halfmove = (piece & PIECE_TYPE_MASK) === P_PAWN || captured !== EMPTY ? 0 : this.halfmove + 1;

    const newEpIdx = this.epSquare >= 0 ? (this.epSquare & 7) + 1 : 0;
    h1 ^= Z_EP_1[newEpIdx];
    h2 ^= Z_EP_2[newEpIdx];
    h1 ^= Z_CASTLE_1[this.castle];
    h2 ^= Z_CASTLE_2[this.castle];

    this.h1 = h1 >>> 0;
    this.h2 = h2 >>> 0;
    this.turn = (us ^ BLACK_BIT) as 0 | 8;
    this.hashHistory.push((this.h1 ^ this.h2) >>> 0);

    // Kendi şahımız tehlikede kaldıysa geri al
    const ourKing = us === 0 ? this.wKingSq : this.bKingSq;
    if (this.isSquareAttacked(ourKing, us ^ BLACK_BIT)) {
      this.unmakeMove(move);
      return false;
    }
    return true;
  }

  public unmakeMove(move: number): void {
    const undo = this.undoStack.pop();
    if (!undo) return;
    this.hashHistory.pop();

    const from = move & MOVE_FROM_MASK;
    const to = (move >> MOVE_TO_SHIFT) & 0x7f;
    const captured = (move >> MOVE_CAP_SHIFT) & 0xf;
    const promo = (move >> MOVE_PROMO_SHIFT) & 7;
    const isEp = (move & MOVE_EP_FLAG) !== 0;
    const isCastle = (move & MOVE_CASTLE_FLAG) !== 0;

    this.turn = (this.turn ^ BLACK_BIT) as 0 | 8;
    const us = this.turn;
    const bd = this.board;

    const movedPiece = promo ? us | P_PAWN : bd[to];
    bd[from] = movedPiece;

    if (isEp) {
      bd[to] = EMPTY;
      const capSq = us === 0 ? to + 16 : to - 16;
      bd[capSq] = captured;
    } else {
      bd[to] = captured;
    }

    if (isCastle) {
      if (to === 0x76) { bd[0x77] = WR; bd[0x75] = EMPTY; }
      else if (to === 0x72) { bd[0x70] = WR; bd[0x73] = EMPTY; }
      else if (to === 0x06) { bd[0x07] = BR; bd[0x05] = EMPTY; }
      else if (to === 0x02) { bd[0x00] = BR; bd[0x03] = EMPTY; }
    }

    this.castle = undo.castle;
    this.epSquare = undo.epSquare;
    this.halfmove = undo.halfmove;
    this.h1 = undo.h1;
    this.h2 = undo.h2;
    this.wKingSq = undo.wKingSq;
    this.bKingSq = undo.bKingSq;
  }

  private makeNullMove(): UndoState {
    const undo: UndoState = {
      castle: this.castle,
      epSquare: this.epSquare,
      halfmove: this.halfmove,
      h1: this.h1,
      h2: this.h2,
      wKingSq: this.wKingSq,
      bKingSq: this.bKingSq,
    };
    const oldEpIdx = this.epSquare >= 0 ? (this.epSquare & 7) + 1 : 0;
    this.h1 = (this.h1 ^ Z_EP_1[oldEpIdx] ^ Z_EP_1[0] ^ Z_TURN_1) >>> 0;
    this.h2 = (this.h2 ^ Z_EP_2[oldEpIdx] ^ Z_EP_2[0] ^ Z_TURN_2) >>> 0;
    this.epSquare = -1;
    this.turn = (this.turn ^ BLACK_BIT) as 0 | 8;
    return undo;
  }

  private unmakeNullMove(undo: UndoState): void {
    this.turn = (this.turn ^ BLACK_BIT) as 0 | 8;
    this.epSquare = undo.epSquare;
    this.h1 = undo.h1;
    this.h2 = undo.h2;
  }

  public getLegalMoves(): number[] {
    const end = this.generatePseudoMoves(0, false);
    const legal: number[] = [];
    for (let i = 0; i < end; i++) {
      const m = this.moveBuf[i];
      if (this.makeMove(m)) {
        legal.push(m);
        this.unmakeMove(m);
      }
    }
    return legal;
  }

  private isRepetitionOrFifty(): boolean {
    if (this.halfmove >= 100) return true;
    const len = this.hashHistory.length;
    if (len < 5) return false;
    const current = this.hashHistory[len - 1];
    let count = 0;
    const limit = Math.max(0, len - 1 - this.halfmove);
    for (let i = len - 3; i >= limit; i -= 2) {
      if (this.hashHistory[i] === current) {
        count++;
        if (count >= 2) return true;
      }
    }
    return false;
  }

  // Konum Değerlendirme: sıradaki oyuncunun bakış açısından centipawn
  public evaluate(): number {
    const bd = this.board;
    let mgW = 0;
    let mgB = 0;
    let egW = 0;
    let egB = 0;
    let phase = 0;

    let wBishops = 0;
    let bBishops = 0;
    let wNonPawnMat = 0;
    let bNonPawnMat = 0;

    const wPawnFiles = new Int8Array(8);
    const bPawnFiles = new Int8Array(8);
    const wPawnMinRank = new Int8Array(8).fill(8); // en ileri (0'a yakın) beyaz piyonun satırı
    const bPawnMaxRank = new Int8Array(8).fill(-1); // en ileri (7'ye yakın) siyah piyonun satırı

    for (let r = 0; r < 8; r++) {
      const rowBase = r << 4;
      for (let f = 0; f < 8; f++) {
        const p = bd[rowBase | f];
        if (p === EMPTY) continue;
        const pt = p & PIECE_TYPE_MASK;
        const isBlack = (p & BLACK_BIT) !== 0;
        const pstIdx = isBlack ? ((7 - r) << 3) | f : (r << 3) | f;

        phase += PHASE_WEIGHT[pt];
        const mgScore = MG_VALUE[pt] + (MG_PSTS[pt] ? MG_PSTS[pt]![pstIdx] : 0);
        const egScore = EG_VALUE[pt] + (EG_PSTS[pt] ? EG_PSTS[pt]![pstIdx] : 0);

        if (!isBlack) {
          mgW += mgScore;
          egW += egScore;
          if (pt === P_BISHOP) wBishops++;
          if (pt !== P_PAWN && pt !== P_KING) wNonPawnMat += SEE_VALUE[pt];
          if (pt === P_PAWN) {
            wPawnFiles[f]++;
            if (r < wPawnMinRank[f]) wPawnMinRank[f] = r;
          }
        } else {
          mgB += mgScore;
          egB += egScore;
          if (pt === P_BISHOP) bBishops++;
          if (pt !== P_PAWN && pt !== P_KING) bNonPawnMat += SEE_VALUE[pt];
          if (pt === P_PAWN) {
            bPawnFiles[f]++;
            if (r > bPawnMaxRank[f]) bPawnMaxRank[f] = r;
          }
        }
      }
    }

    // Fil çifti bonusu
    if (wBishops >= 2) { mgW += 36; egW += 52; }
    if (bBishops >= 2) { mgB += 36; egB += 52; }

    // Piyon yapısı, geçer piyonlar ve açık hatlarda kaleler
    const passedMg = [0, 75, 45, 28, 16, 8, 4, 0];
    const passedEg = [0, 145, 95, 58, 32, 16, 8, 0];

    for (let f = 0; f < 8; f++) {
      if (wPawnFiles[f] > 1) {
        mgW -= (wPawnFiles[f] - 1) * 12;
        egW -= (wPawnFiles[f] - 1) * 20;
      }
      if (bPawnFiles[f] > 1) {
        mgB -= (bPawnFiles[f] - 1) * 12;
        egB -= (bPawnFiles[f] - 1) * 20;
      }
      // İzole piyonlar
      const wIso =
        wPawnFiles[f] > 0 &&
        (f === 0 || wPawnFiles[f - 1] === 0) &&
        (f === 7 || wPawnFiles[f + 1] === 0);
      if (wIso) { mgW -= 14; egW -= 18; }

      const bIso =
        bPawnFiles[f] > 0 &&
        (f === 0 || bPawnFiles[f - 1] === 0) &&
        (f === 7 || bPawnFiles[f + 1] === 0);
      if (bIso) { mgB -= 14; egB -= 18; }
    }

    // İkinci tarama: geçer piyon, kale açık hatları, şah piyon kalkanı & hareketlilik
    for (let r = 0; r < 8; r++) {
      const rowBase = r << 4;
      for (let f = 0; f < 8; f++) {
        const p = bd[rowBase | f];
        if (p === EMPTY) continue;
        const pt = p & PIECE_TYPE_MASK;
        const isBlack = (p & BLACK_BIT) !== 0;

        if (pt === P_PAWN) {
          if (!isBlack) {
            const blockedLeft = f > 0 && bPawnMaxRank[f - 1] >= r ? false : true;
            const blockedSelf = bPawnMaxRank[f] >= r ? false : true;
            const blockedRight = f < 7 && bPawnMaxRank[f + 1] >= r ? false : true;
            if (blockedLeft && blockedSelf && blockedRight) {
              mgW += passedMg[r];
              egW += passedEg[r];
            }
          } else {
            const blockedLeft = f > 0 && wPawnMinRank[f - 1] <= r ? false : true;
            const blockedSelf = wPawnMinRank[f] <= r ? false : true;
            const blockedRight = f < 7 && wPawnMinRank[f + 1] <= r ? false : true;
            if (blockedLeft && blockedSelf && blockedRight) {
              const distFromGoal = 7 - r;
              mgB += passedMg[distFromGoal];
              egB += passedEg[distFromGoal];
            }
          }
        } else if (pt === P_ROOK) {
          if (!isBlack) {
            if (wPawnFiles[f] === 0) {
              const open = bPawnFiles[f] === 0;
              mgW += open ? 24 : 12;
              egW += open ? 20 : 10;
            }
            if (r === 1) { mgW += 22; egW += 30; }
          } else {
            if (bPawnFiles[f] === 0) {
              const open = wPawnFiles[f] === 0;
              mgB += open ? 24 : 12;
              egB += open ? 20 : 10;
            }
            if (r === 6) { mgB += 22; egB += 30; }
          }
        } else if (pt === P_KNIGHT) {
          // Merkez veya ileri karakol at bonusu
          if (!isBlack && r >= 2 && r <= 4 && f >= 2 && f <= 5) {
            const supported =
              (f > 0 && bd[((r + 1) << 4) | (f - 1)] === WP) ||
              (f < 7 && bd[((r + 1) << 4) | (f + 1)] === WP);
            if (supported) { mgW += 18; egW += 14; }
          } else if (isBlack && r >= 3 && r <= 5 && f >= 2 && f <= 5) {
            const supported =
              (f > 0 && bd[((r - 1) << 4) | (f - 1)] === BP) ||
              (f < 7 && bd[((r - 1) << 4) | (f + 1)] === BP);
            if (supported) { mgB += 18; egB += 14; }
          }
        }
      }
    }

    // Oyunortası Şah güvenliği (piyon kalkanı)
    const wkR = this.wKingSq >> 4;
    const wkF = this.wKingSq & 7;
    if (wkR === 7 && (wkF >= 5 || wkF <= 2)) {
      for (let df = -1; df <= 1; df++) {
        const nf = wkF + df;
        if (nf >= 0 && nf <= 7) {
          if (bd[(6 << 4) | nf] === WP) mgW += 15;
          else if (bd[(5 << 4) | nf] === WP) mgW += 8;
          else mgW -= 12;
        }
      }
    }
    const bkR = this.bKingSq >> 4;
    const bkF = this.bKingSq & 7;
    if (bkR === 0 && (bkF >= 5 || bkF <= 2)) {
      for (let df = -1; df <= 1; df++) {
        const nf = bkF + df;
        if (nf >= 0 && nf <= 7) {
          if (bd[(1 << 4) | nf] === BP) mgB += 15;
          else if (bd[(2 << 4) | nf] === BP) mgB += 8;
          else mgB -= 12;
        }
      }
    }

    // Oyunsonu mat sürme (Mop-up) değerlendirmesi: net materyal üstünlüğünde rakip şahı kenara sıkıştır
    if (bNonPawnMat === 0 && wNonPawnMat >= 500 && egW - egB > 250) {
      const centerDist = Math.abs(bkR - 3.5) + Math.abs(bkF - 3.5);
      const kingDist = Math.abs(wkR - bkR) + Math.abs(wkF - bkF);
      egW += Math.round(centerDist * 14 + (14 - kingDist) * 7);
    } else if (wNonPawnMat === 0 && bNonPawnMat >= 500 && egB - egW > 250) {
      const centerDist = Math.abs(wkR - 3.5) + Math.abs(wkF - 3.5);
      const kingDist = Math.abs(wkR - bkR) + Math.abs(wkF - bkF);
      egB += Math.round(centerDist * 14 + (14 - kingDist) * 7);
    }

    const clampedPhase = Math.min(24, phase);
    const mgEval = mgW - mgB;
    const egEval = egW - egB;
    const whiteScore = Math.round((mgEval * clampedPhase + egEval * (24 - clampedPhase)) / 24);
    // Tempo bonusu (+10cp)
    return (this.turn === 0 ? whiteScore : -whiteScore) + 10;
  }

  private scoreMove(move: number, ply: number, ttMove: number): number {
    if (move === ttMove) return 2_000_000;
    const captured = (move >> MOVE_CAP_SHIFT) & 0xf;
    const promo = (move >> MOVE_PROMO_SHIFT) & 7;
    if (captured !== EMPTY) {
      const from = move & MOVE_FROM_MASK;
      const attackerPt = this.board[from] & PIECE_TYPE_MASK;
      const victimPt = captured & PIECE_TYPE_MASK;
      return 1_000_000 + SEE_VALUE[victimPt] * 10 - attackerPt;
    }
    if (promo) {
      return 900_000 + SEE_VALUE[promo];
    }
    if (move === this.killer1[ply]) return 800_000;
    if (move === this.killer2[ply]) return 750_000;
    const from = move & MOVE_FROM_MASK;
    const to = (move >> MOVE_TO_SHIFT) & 0x7f;
    const colorIdx = this.turn === 0 ? 0 : 1;
    return this.history[(colorIdx << 14) | (from << 7) | to];
  }

  private pickBestMove(start: number, end: number, scores: Int32Array): void {
    let bestIdx = start;
    let bestScore = scores[start];
    for (let i = start + 1; i < end; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIdx = i;
      }
    }
    if (bestIdx !== start) {
      const tm = this.moveBuf[start];
      this.moveBuf[start] = this.moveBuf[bestIdx];
      this.moveBuf[bestIdx] = tm;
      const ts = scores[start];
      scores[start] = scores[bestIdx];
      scores[bestIdx] = ts;
    }
  }

  private quiescence(alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && performance.now() - this.startTime >= this.timeBudgetMs) {
      this.stopRequested = true;
      return alpha;
    }
    if (ply >= 96) return this.evaluate();

    const inChk = this.inCheck();
    let standPat = -MATE_SCORE + ply;
    if (!inChk) {
      standPat = this.evaluate();
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    }

    const start = ply << 8;
    // Şah altındaysak tüm kaçış hamlelerini üret; değilse yalnızca alış ve terfiler
    const end = this.generatePseudoMoves(ply, !inChk);
    const scores = new Int32Array(end - start);
    for (let i = start; i < end; i++) {
      scores[i - start] = this.scoreMove(this.moveBuf[i], ply, 0);
    }

    let legalCount = 0;
    for (let i = start; i < end; i++) {
      // Sıralı seçim
      let best = i;
      let bestS = scores[i - start];
      for (let j = i + 1; j < end; j++) {
        if (scores[j - start] > bestS) {
          bestS = scores[j - start];
          best = j;
        }
      }
      if (best !== i) {
        const tm = this.moveBuf[i];
        this.moveBuf[i] = this.moveBuf[best];
        this.moveBuf[best] = tm;
        const ts = scores[i - start];
        scores[i - start] = scores[best - start];
        scores[best - start] = ts;
      }

      const move = this.moveBuf[i];
      // Delta budama (şah altında değilken umutsuz alışları atla)
      if (!inChk) {
        const cap = (move >> MOVE_CAP_SHIFT) & 0xf;
        const promo = (move >> MOVE_PROMO_SHIFT) & 7;
        if (cap && !promo && standPat + SEE_VALUE[cap & PIECE_TYPE_MASK] + 180 < alpha) {
          continue;
        }
      }

      if (!this.makeMove(move)) continue;
      legalCount++;
      const score = -this.quiescence(-beta, -alpha, ply + 1);
      this.unmakeMove(move);

      if (this.stopRequested) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    if (inChk && legalCount === 0) {
      return -MATE_SCORE + ply;
    }
    return alpha;
  }

  private alphabeta(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    allowNull: boolean,
  ): number {
    if (this.stopRequested) return alpha;
    if (ply > 0 && this.isRepetitionOrFifty()) return 0;

    const inChk = this.inCheck();
    if (inChk && ply < 40) depth++;

    if (depth <= 0) {
      return this.quiescence(alpha, beta, ply);
    }

    this.nodes++;
    if ((this.nodes & 1023) === 0 && performance.now() - this.startTime >= this.timeBudgetMs) {
      this.stopRequested = true;
      return alpha;
    }

    const isPv = beta - alpha > 1;
    const ttIdx = (this.h1 ^ this.h2) & TT_MASK;
    let ttMove = 0;

    if (this.ttKey1[ttIdx] === this.h1 && this.ttKey2[ttIdx] === this.h2) {
      ttMove = this.ttMove[ttIdx];
      if (!isPv && ply > 0 && this.ttDepth[ttIdx] >= depth) {
        let ttVal = this.ttScore[ttIdx];
        if (ttVal > MATE_THRESHOLD) ttVal -= ply;
        else if (ttVal < -MATE_THRESHOLD) ttVal += ply;

        const flag = this.ttFlag[ttIdx];
        if (flag === TT_EXACT) return ttVal;
        if (flag === TT_LOWER && ttVal >= beta) return ttVal;
        if (flag === TT_UPPER && ttVal <= alpha) return ttVal;
      }
    }

    // Null Move Pruning (piyon oyunsonu dışında)
    if (allowNull && !isPv && !inChk && depth >= 3 && this.hasNonPawnMaterial(this.turn)) {
      const undo = this.makeNullMove();
      const R = depth >= 6 ? 3 : 2;
      const nullScore = -this.alphabeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      this.unmakeNullMove(undo);
      if (this.stopRequested) return alpha;
      if (nullScore >= beta) return beta;
    }

    // Razoring / Futility
    const staticEval = !inChk ? this.evaluate() : -MATE_SCORE;
    if (!isPv && !inChk && depth === 1 && staticEval + 180 < alpha) {
      return this.quiescence(alpha, beta, ply);
    }

    const start = ply << 8;
    const end = this.generatePseudoMoves(ply, false);
    const count = end - start;
    const scores = new Int32Array(end);
    for (let i = start; i < end; i++) {
      scores[i] = this.scoreMove(this.moveBuf[i], ply, ttMove);
    }

    let bestMove = 0;
    let bestScore = -MATE_SCORE - 100;
    let legalMoves = 0;
    const origAlpha = alpha;

    for (let i = start; i < end; i++) {
      this.pickBestMove(i, end, scores);
      const move = this.moveBuf[i];

      if (!this.makeMove(move)) continue;
      legalMoves++;

      const captured = (move >> MOVE_CAP_SHIFT) & 0xf;
      const promo = (move >> MOVE_PROMO_SHIFT) & 7;
      const givesCheck = this.inCheck();

      let score: number;
      if (legalMoves === 1) {
        score = -this.alphabeta(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // Geç Hamle İndirgemesi (LMR)
        let reduction = 0;
        if (
          depth >= 3 &&
          legalMoves >= 4 &&
          !inChk &&
          !givesCheck &&
          captured === EMPTY &&
          promo === 0 &&
          move !== this.killer1[ply] &&
          move !== this.killer2[ply]
        ) {
          reduction = legalMoves >= 9 && depth >= 5 ? 2 : 1;
        }

        score = -this.alphabeta(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0 && !this.stopRequested) {
          score = -this.alphabeta(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        }
        if (score > alpha && score < beta && !this.stopRequested) {
          score = -this.alphabeta(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }

      this.unmakeMove(move);
      if (this.stopRequested) return alpha;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (captured === EMPTY && promo === 0) {
              if (this.killer1[ply] !== move) {
                this.killer2[ply] = this.killer1[ply];
                this.killer1[ply] = move;
              }
              const from = move & MOVE_FROM_MASK;
              const to = (move >> MOVE_TO_SHIFT) & 0x7f;
              const cIdx = this.turn === 0 ? 0 : 1;
              const hIdx = (cIdx << 14) | (from << 7) | to;
              this.history[hIdx] = Math.min(400_000, this.history[hIdx] + depth * depth);
            }
            break;
          }
        }
      }
    }

    if (legalMoves === 0) {
      return inChk ? -MATE_SCORE + ply : 0;
    }

    if (count > 0 && !this.stopRequested) {
      let storeVal = bestScore;
      if (storeVal > MATE_THRESHOLD) storeVal += ply;
      else if (storeVal < -MATE_THRESHOLD) storeVal -= ply;

      this.ttKey1[ttIdx] = this.h1;
      this.ttKey2[ttIdx] = this.h2;
      this.ttDepth[ttIdx] = depth;
      this.ttMove[ttIdx] = bestMove;
      this.ttScore[ttIdx] = storeVal;
      this.ttFlag[ttIdx] =
        bestScore <= origAlpha ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
    }

    return bestScore;
  }

  private hasNonPawnMaterial(color: number): boolean {
    const bd = this.board;
    for (let r = 0; r < 8; r++) {
      const rowBase = r << 4;
      for (let f = 0; f < 8; f++) {
        const p = bd[rowBase | f];
        if (p !== EMPTY && (p & BLACK_BIT) === color) {
          const pt = p & PIECE_TYPE_MASK;
          if (pt !== P_PAWN && pt !== P_KING) return true;
        }
      }
    }
    return false;
  }

  private extractPv(maxLen = 10): string[] {
    const pv: string[] = [];
    const made: number[] = [];
    const seenHashes = new Set<string>();

    for (let i = 0; i < maxLen; i++) {
      const key = `${this.h1}:${this.h2}`;
      if (seenHashes.has(key)) break;
      seenHashes.add(key);

      const ttIdx = (this.h1 ^ this.h2) & TT_MASK;
      if (this.ttKey1[ttIdx] !== this.h1 || this.ttKey2[ttIdx] !== this.h2) break;
      const mv = this.ttMove[ttIdx];
      if (!mv) break;

      const legal = this.getLegalMoves();
      if (!legal.includes(mv)) break;
      if (!this.makeMove(mv)) break;
      made.push(mv);
      pv.push(moveToUci(mv));
    }

    for (let i = made.length - 1; i >= 0; i--) {
      this.unmakeMove(made[i]);
    }
    return pv;
  }

  public stop(): void {
    this.stopRequested = true;
  }

  private buildTacticalInsight(bestMove: number, scoreSideCp: number, mateInMoves: number | null): string {
    if (mateInMoves !== null) {
      const mMoves = Math.max(1, Math.abs(mateInMoves));
      if (mateInMoves > 0) {
        return mMoves === 1
          ? 'Kesin mat! Tek hamlede oyunu bitiriyor.'
          : `${mMoves} hamlede zorunlu şah mat yolu bulundu.`;
      }
      return 'Rakip mat tehdidini en dirençli savunma ile geciktiriyor.';
    }

    const from = bestMove & MOVE_FROM_MASK;
    const to = (bestMove >> MOVE_TO_SHIFT) & 0x7f;
    const cap = (bestMove >> MOVE_CAP_SHIFT) & 0xf;
    const promo = (bestMove >> MOVE_PROMO_SHIFT) & 7;
    const isCastle = (bestMove & MOVE_CASTLE_FLAG) !== 0;
    const movingPt = this.board[from] & PIECE_TYPE_MASK;

    let givesCheck = false;
    let attacksValuable = false;
    if (this.makeMove(bestMove)) {
      givesCheck = this.inCheck();
      if (givesCheck) {
        // Çatal / çifte saldırı kontrolü
        const opp = this.turn;
        let attackedCount = 0;
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const sq = (r << 4) | f;
            const p = this.board[sq];
            if (p !== EMPTY && (p & BLACK_BIT) === opp && (p & PIECE_TYPE_MASK) >= P_ROOK) {
              if (this.isSquareAttacked(sq, opp ^ BLACK_BIT)) attackedCount++;
            }
          }
        }
        if (attackedCount >= 2) attacksValuable = true;
      }
      this.unmakeMove(bestMove);
    }

    if (promo === P_QUEEN) return 'Piyon terfisi ile vezir kazanıyor ve üstünlüğü garantiliyor.';
    if (givesCheck && attacksValuable) return 'Şah çekerek çatal atıyor ve yüksek değerli taş hedefliyor.';
    if (cap !== EMPTY) {
      const capPt = cap & PIECE_TYPE_MASK;
      if (capPt === P_QUEEN) return 'Rakip veziri alarak belirleyici materyal üstünlüğü kuruyor.';
      if (capPt === P_ROOK) return 'Kale kazancı sağlayan keskin taktik alış.';
      if (SEE_VALUE[capPt] > SEE_VALUE[movingPt]) return 'Materyal takasından kârlı çıkan temiz alış hamlesi.';
      return 'Taş değişimiyle baskıyı artırıp konumu sadeleştiriyor.';
    }
    if (givesCheck) return 'Şah çekerek inisiyatifi ve tempoyu ele geçiriyor.';
    if (isCastle) return 'Şahı güvene alıp kaleyi oyuna bağlayan sağlam rok.';
    if (scoreSideCp >= 250) return 'Net üstünlüğü rakibe karşı oyun şansı vermeden pekiştiriyor.';
    if (scoreSideCp <= -200) return 'Zor durumda karşı oyun arayan en dirençli savunma hamlesi.';
    const toRank = to >> 4;
    const toFile = to & 7;
    if (toRank >= 2 && toRank <= 5 && toFile >= 2 && toFile <= 5) {
      return 'Merkez karelerin kontrolünü güçlendirip taş aktivitesini yükseltiyor.';
    }
    return 'Konumsal dengeyi optimize eden en güçlü devam yolu.';
  }

  public search(
    fen: string,
    options: SearchOptions = {},
    onProgress?: (snapshot: RawSearchSnapshot) => void,
  ): RawSearchSnapshot {
    if (!this.loadFen(fen)) {
      return {
        fen,
        depth: 0,
        nodes: 0,
        lines: [],
        bestMoveUci: null,
        insight: null,
      };
    }

    const legalMoves = this.getLegalMoves();
    if (legalMoves.length === 0) {
      const chk = this.inCheck();
      const sideSign = this.turn === 0 ? 1 : -1;
      const mateVal = chk ? -1 * sideSign : null;
      const cpVal = chk ? -10000 * sideSign : 0;
      const snap: RawSearchSnapshot = {
        fen,
        depth: 0,
        nodes: 1,
        lines: [
          {
            multipv: 1,
            depth: 0,
            scoreCp: cpVal,
            mate: mateVal,
            pvUci: [],
          },
        ],
        bestMoveUci: null,
        insight: chk ? 'Şah mat konumu.' : 'Pat — berabere.',
      };
      onProgress?.(snap);
      return snap;
    }

    const skill = Math.max(0, Math.min(20, options.skillLevel ?? 20));
    const maxDepth = Math.max(
      1,
      Math.min(18, options.depth ?? (skill >= 18 ? 10 : skill >= 12 ? 7 : 5)),
    );
    const movetimeMs = Math.max(60, Math.min(10000, options.movetimeMs ?? 900));
    const multiPv = Math.max(1, Math.min(legalMoves.length, options.multiPv ?? 1));

    // Açılış kitabı kontrolü (MultiPV === 1 ve yüksek seviye veya analiz için hızlı kitap hamlesi)
    if (skill >= 10 && multiPv === 1) {
      const bKey = bookKeyFromFen(fen);
      const bookMoves = OPENING_BOOK[bKey];
      if (bookMoves && bookMoves.length > 0) {
        const legalUciSet = new Map(legalMoves.map((m) => [moveToUci(m), m]));
        const candidates = bookMoves.filter((u) => legalUciSet.has(u));
        if (candidates.length > 0) {
          // Analizde veya yüksek derinlik aramasında kitap hamlesini PV olarak sunup kısa doğrulama yapalım
          const pickedUci =
            skill >= 18
              ? candidates[0]
              : candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
          const pickedMove = legalUciSet.get(pickedUci)!;
          if (skill < 18 && options.depth && options.depth <= 8) {
            const whiteSign = this.turn === 0 ? 1 : -1;
            const evalCp = this.evaluate() * whiteSign;
            const snap: RawSearchSnapshot = {
              fen,
              depth: 1,
              nodes: 1,
              lines: [{ multipv: 1, depth: 1, scoreCp: evalCp, mate: null, pvUci: [pickedUci] }],
              bestMoveUci: pickedUci,
              insight: 'Teorik ana devam yolu — açılış prensiplerine tam uyumlu.',
            };
            onProgress?.(snap);
            return snap;
          }
          // TT'ye öncelik ver
          const ttIdx = (this.h1 ^ this.h2) & TT_MASK;
          this.ttKey1[ttIdx] = this.h1;
          this.ttKey2[ttIdx] = this.h2;
          this.ttDepth[ttIdx] = 1;
          this.ttMove[ttIdx] = pickedMove;
          this.ttScore[ttIdx] = this.evaluate();
          this.ttFlag[ttIdx] = TT_EXACT;
        }
      }
    }

    this.nodes = 0;
    this.startTime = performance.now();
    this.timeBudgetMs = movetimeMs;
    this.stopRequested = false;
    this.killer1.fill(0);
    this.killer2.fill(0);
    this.history.fill(0);

    const whiteSign = this.turn === 0 ? 1 : -1;
    let bestRootLines: RawEngineLine[] = [];
    let completedDepth = 0;

    // İlk yasal hamlelerden güvenli başlangıç yedeği
    let fallbackBestMove = legalMoves[0];

    for (let depth = 1; depth <= maxDepth; depth++) {
      const excluded = new Set<number>();
      const iterLines: RawEngineLine[] = [];

      for (let pvIdx = 0; pvIdx < multiPv; pvIdx++) {
        let bestMove = 0;
        let bestScore = -MATE_SCORE - 100;
        let alpha = -MATE_SCORE - 50;
        const beta = MATE_SCORE + 50;

        // Kök hamlelerini sırala (önce önceki derinliğin en iyi hamlesi + TT + MVV-LVA)
        const prevTopMove =
          pvIdx === 0 && bestRootLines[0]?.pvUci[0]
            ? legalMoves.find((m) => moveToUci(m) === bestRootLines[0].pvUci[0]) || 0
            : 0;

        const ttIdx = (this.h1 ^ this.h2) & TT_MASK;
        const ttRoot =
          this.ttKey1[ttIdx] === this.h1 && this.ttKey2[ttIdx] === this.h2
            ? this.ttMove[ttIdx]
            : 0;

        const sortedRoot = [...legalMoves]
          .filter((m) => !excluded.has(m))
          .sort((a, b) => {
            const sa = a === prevTopMove ? 5_000_000 : this.scoreMove(a, 0, ttRoot);
            const sb = b === prevTopMove ? 5_000_000 : this.scoreMove(b, 0, ttRoot);
            return sb - sa;
          });

        if (sortedRoot.length === 0) break;

        for (let idx = 0; idx < sortedRoot.length; idx++) {
          const move = sortedRoot[idx];
          this.makeMove(move);
          let score: number;
          if (idx === 0) {
            score = -this.alphabeta(depth - 1, -beta, -alpha, 1, true);
          } else {
            score = -this.alphabeta(depth - 1, -alpha - 1, -alpha, 1, true);
            if (score > alpha && !this.stopRequested) {
              score = -this.alphabeta(depth - 1, -beta, -alpha, 1, true);
            }
          }
          this.unmakeMove(move);

          if (this.stopRequested) break;

          if (score > bestScore) {
            bestScore = score;
            bestMove = move;
            if (score > alpha) alpha = score;
          }
        }

        if (this.stopRequested || !bestMove) break;

        excluded.add(bestMove);
        if (pvIdx === 0) {
          fallbackBestMove = bestMove;
          // Ana hattın TT kaydını güvenceye al
          this.ttKey1[ttIdx] = this.h1;
          this.ttKey2[ttIdx] = this.h2;
          this.ttDepth[ttIdx] = depth;
          this.ttMove[ttIdx] = bestMove;
          this.ttScore[ttIdx] = bestScore;
          this.ttFlag[ttIdx] = TT_EXACT;
        }

        this.makeMove(bestMove);
        const subPv = this.extractPv(8);
        this.unmakeMove(bestMove);

        const pvUci = [moveToUci(bestMove), ...subPv];

        let scoreCp: number | null = null;
        let mate: number | null = null;
        if (Math.abs(bestScore) >= MATE_THRESHOLD) {
          const pliesToMate = MATE_SCORE - Math.abs(bestScore);
          const mateInMoves = Math.max(1, Math.ceil(pliesToMate / 2));
          mate = (bestScore > 0 ? mateInMoves : -mateInMoves) * whiteSign;
        } else {
          scoreCp = bestScore * whiteSign;
        }

        iterLines.push({
          multipv: pvIdx + 1,
          depth,
          scoreCp,
          mate,
          pvUci,
        });
      }

      if (this.stopRequested) break;
      if (iterLines.length > 0) {
        bestRootLines = iterLines;
        completedDepth = depth;
        const topLine = iterLines[0];
        const snap: RawSearchSnapshot = {
          fen,
          depth: completedDepth,
          nodes: this.nodes,
          lines: bestRootLines,
          bestMoveUci: topLine.pvUci[0] || moveToUci(fallbackBestMove),
          insight: null,
        };
        if (onProgress && depth >= 2) {
          onProgress(snap);
        }

        // Kesin mat hemen bulunduysa zaman kaybetme
        if (topLine.mate !== null && Math.abs(topLine.mate) <= Math.ceil(depth / 2)) {
          break;
        }
      }

      if (performance.now() - this.startTime >= this.timeBudgetMs * 0.72) {
        break;
      }
    }

    if (bestRootLines.length === 0) {
      const fbUci = moveToUci(fallbackBestMove);
      bestRootLines = [
        {
          multipv: 1,
          depth: 1,
          scoreCp: this.evaluate() * whiteSign,
          mate: null,
          pvUci: [fbUci],
        },
      ];
      completedDepth = 1;
    }

    // Düşük beceri seviyelerinde insan benzeri hafif seçim varyasyonu (MultiPV 1 veya düşük derinlikte)
    let chosenUci = bestRootLines[0].pvUci[0] || moveToUci(fallbackBestMove);
    if (skill < 12 && legalMoves.length > 1) {
      const blunderChance = skill <= 2 ? 0.36 : skill <= 5 ? 0.18 : 0.08;
      if (Math.random() < blunderChance && bestRootLines.length >= 2) {
        const alt = bestRootLines[Math.min(bestRootLines.length - 1, Math.random() < 0.4 ? 2 : 1)];
        if (alt?.pvUci[0]) chosenUci = alt.pvUci[0];
      }
    }

    const bestLine = bestRootLines[0];
    const sideMate = bestLine.mate !== null ? bestLine.mate * whiteSign : null;
    const sideCp = bestLine.scoreCp !== null ? bestLine.scoreCp * whiteSign : 0;
    const bestMoveObj =
      legalMoves.find((m) => moveToUci(m) === chosenUci) || fallbackBestMove;
    const insight = this.buildTacticalInsight(bestMoveObj, sideCp, sideMate);

    return {
      fen,
      depth: completedDepth,
      nodes: this.nodes,
      lines: bestRootLines,
      bestMoveUci: chosenUci,
      insight,
    };
  }
}
