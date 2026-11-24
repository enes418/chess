import { Chess, Move, Square } from 'chess.js';
import type { BoardThemeId, DifficultyLevel, MoveClassification } from '../types/chess';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const DIFFICULTY_CONFIG: Record<
  DifficultyLevel,
  {
    label: string;
    elo: number;
    skillLevel: number;
    depth: number;
    defaultTimeMs: number;
    description: string;
  }
> = {
  beginner: {
    label: 'Başlangıç',
    elo: 600,
    skillLevel: 1,
    depth: 2,
    defaultTimeMs: 180,
    description: 'Rahat oyun temposu, zaman zaman taktik hatalar yapar.',
  },
  easy: {
    label: 'Kolay',
    elo: 950,
    skillLevel: 5,
    depth: 3,
    defaultTimeMs: 280,
    description: 'Taşları düzenli geliştirir, keskin taktiklerde hata yapabilir.',
  },
  intermediate: {
    label: 'Orta',
    elo: 1350,
    skillLevel: 10,
    depth: 5,
    defaultTimeMs: 500,
    description: 'Sağlam kulüp seviyesi temel bilgi ve taktik farkındalık.',
  },
  advanced: {
    label: 'İleri',
    elo: 1750,
    skillLevel: 14,
    depth: 7,
    defaultTimeMs: 850,
    description: 'Güçlü konumsal baskı ve isabetli varyant hesaplaması.',
  },
  expert: {
    label: 'Uzman',
    elo: 2150,
    skillLevel: 18,
    depth: 9,
    defaultTimeMs: 1300,
    description: 'Derin öngörülü turnuva seviyesi hesaplama.',
  },
  master: {
    label: 'Usta',
    elo: 2600,
    skillLevel: 20,
    depth: 12,
    defaultTimeMs: 2000,
    description: 'Tam Pro Motor gücü — yüksek taktik keskinlik ve hassasiyet.',
  },
};

export const BOARD_THEMES: Record<
  BoardThemeId,
  {
    name: string;
    light: string;
    dark: string;
    highlightLight: string;
    highlightDark: string;
    coordLight: string;
    coordDark: string;
  }
> = {
  obsidian: {
    name: 'Obsidyen Turnuva',
    light: '#CBD5E1',
    dark: '#334155',
    highlightLight: '#FDE047',
    highlightDark: '#CA8A04',
    coordLight: '#334155',
    coordDark: '#CBD5E1',
  },
  emerald: {
    name: 'Klasik Yeşil',
    light: '#EBECD0',
    dark: '#739552',
    highlightLight: '#F5F682',
    highlightDark: '#B9CA43',
    coordLight: '#739552',
    coordDark: '#EBECD0',
  },
  walnut: {
    name: 'Ceviz Ahşap',
    light: '#F0D9B5',
    dark: '#B58863',
    highlightLight: '#F6E58D',
    highlightDark: '#C9A84C',
    coordLight: '#B58863',
    coordDark: '#F0D9B5',
  },
  slate: {
    name: 'Gece Grisi',
    light: '#DEE3E6',
    dark: '#8CA2AD',
    highlightLight: '#9CC7E3',
    highlightDark: '#6999B8',
    coordLight: '#8CA2AD',
    coordDark: '#DEE3E6',
  },
};

const OPENING_SIGNATURES: { moves: string[]; name: string }[] = [
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'İtalyan Açılışı: Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'İtalyan Açılışı: İki At Savunması' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'İtalyan Açılışı' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], name: 'İspanyol Açılışı (Ruy Lopez): Morphy Savunması' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'İspanyol Açılışı (Ruy Lopez)' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: 'Petrov Savunması' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], name: 'Sicilya Savunması: Najdorf' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'], name: 'Sicilya Savunması: Rossolimo' },
  { moves: ['e4', 'c5', 'c3'], name: 'Sicilya Savunması: Alapin Varyantı' },
  { moves: ['e4', 'c5'], name: 'Sicilya Savunması' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], name: 'Fransız Savunması: Klasik / Winawer' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], name: 'Fransız Savunması: İlerleme Varyantı' },
  { moves: ['e4', 'e6'], name: 'Fransız Savunması' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Savunması' },
  { moves: ['e4', 'd5'], name: 'İskandinav Savunması' },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: 'Vezir Gambiti Reddedilmiş' },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Savunması' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], name: 'Vezir Gambiti Kabul Edilmiş' },
  { moves: ['d4', 'd5', 'c4'], name: 'Vezir Gambiti' },
  { moves: ['d4', 'd5', 'Bf4'], name: 'Londra Sistemi' },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], name: 'Şah Hint Savunması' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], name: 'Nimzo-Hint Savunması' },
  { moves: ['d4', 'Nf6', 'Bf4'], name: 'Londra Sistemi' },
  { moves: ['c4'], name: 'İngiliz Açılışı' },
  { moves: ['Nf3'], name: 'Réti Açılışı' },
  { moves: ['e4'], name: 'Şah Piyonu Açılışı' },
  { moves: ['d4'], name: 'Vezir Piyonu Açılışı' },
];

export function detectOpeningName(sanHistory: string[]): string {
  for (const sig of OPENING_SIGNATURES) {
    if (sig.moves.length <= sanHistory.length) {
      const matches = sig.moves.every((m, idx) => sanHistory[idx] === m);
      if (matches) return sig.name;
    }
  }
  return sanHistory.length === 0 ? 'Başlangıç Konumu' : 'Sınıflandırılmamış Açılış';
}

export function getLegalMovesBySquare(chess: Chess): Record<string, Move[]> {
  const moves = chess.moves({ verbose: true });
  const map: Record<string, Move[]> = {};
  for (const move of moves) {
    if (!map[move.from]) map[move.from] = [];
    map[move.from].push(move);
  }
  return map;
}

export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from);
  if (!piece || piece.type !== 'p') return false;
  const targetRank = to[1];
  return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
}

export function pvUciToSan(fen: string, pvUci: string[], maxMoves = 8): string[] {
  const clone = new Chess(fen);
  const result: string[] = [];
  for (let i = 0; i < Math.min(pvUci.length, maxMoves); i++) {
    const uci = pvUci[i];
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined;
    try {
      const moved = clone.move({ from, to, promotion });
      if (!moved) break;
      result.push(moved.san);
    } catch {
      break;
    }
  }
  return result;
}

export function uciToSingleSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  const arr = pvUciToSan(fen, [uci], 1);
  return arr[0] ?? null;
}

export function validateFen(fen: string): { valid: boolean; error?: string } {
  try {
    new Chess(fen.trim());
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Geçersiz FEN dizilimi' };
  }
}

export interface ParsedGamePly {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
}

export function parsePgnToPlies(pgn: string): {
  valid: boolean;
  initialFen: string;
  plies: ParsedGamePly[];
  error?: string;
} {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn.trim());
    const history = chess.history({ verbose: true });
    const headerFen = chess.getHeaders().FEN || INITIAL_FEN;
    const replay = new Chess(headerFen);
    const plies: ParsedGamePly[] = [];

    history.forEach((m, idx) => {
      const fenBefore = replay.fen();
      const moved = replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      const fenAfter = replay.fen();
      plies.push({
        ply: idx + 1,
        moveNumber: Math.floor(idx / 2) + 1,
        color: m.color,
        san: moved.san,
        uci: `${m.from}${m.to}${m.promotion || ''}`,
        from: m.from,
        to: m.to,
        fenBefore,
        fenAfter,
      });
    });

    return { valid: true, initialFen: headerFen, plies };
  } catch (err) {
    return {
      valid: false,
      initialFen: INITIAL_FEN,
      plies: [],
      error: err instanceof Error ? err.message : 'PGN çözümlenemedi',
    };
  }
}

export function getMaterialSummary(fen: string): {
  capturedByWhite: string[];
  capturedByBlack: string[];
  whiteAdvantage: number;
} {
  const startingCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const currentWhite: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const currentBlack: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

  const placement = fen.split(' ')[0] || '';
  for (const ch of placement) {
    if (ch >= 'a' && ch <= 'z' && ch !== 'k') {
      currentBlack[ch] = (currentBlack[ch] || 0) + 1;
    } else if (ch >= 'A' && ch <= 'Z' && ch !== 'K') {
      const lower = ch.toLowerCase();
      currentWhite[lower] = (currentWhite[lower] || 0) + 1;
    }
  }

  const order = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];
  let whiteMat = 0;
  let blackMat = 0;

  for (const t of order) {
    whiteMat += (currentWhite[t] || 0) * values[t];
    blackMat += (currentBlack[t] || 0) * values[t];
    const missingBlack = Math.max(0, startingCounts[t] - (currentBlack[t] || 0));
    const missingWhite = Math.max(0, startingCounts[t] - (currentWhite[t] || 0));
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(`b${t.toUpperCase()}`);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(`w${t.toUpperCase()}`);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: whiteMat - blackMat,
  };
}

export function classifyCpLoss(cpLoss: number, isBestMove: boolean, wasSacrifice: boolean): MoveClassification {
  if (isBestMove && wasSacrifice && cpLoss <= 15) return 'brilliant';
  if (isBestMove || cpLoss <= 10) return 'best';
  if (cpLoss <= 25) return 'excellent';
  if (cpLoss <= 50) return 'good';
  if (cpLoss <= 100) return 'inaccuracy';
  if (cpLoss <= 220) return 'mistake';
  return 'blunder';
}

export function cpToWinProbability(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function calculateMoveAccuracy(winProbBefore: number, winProbAfter: number): number {
  const diff = Math.max(0, winProbBefore - winProbAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export function detectGamePhase(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  const placement = fen.split(' ')[0] || '';
  let nonKingCount = 0;
  let queens = 0;
  for (const ch of placement) {
    if ('prnbqPRNBQ'.includes(ch)) nonKingCount++;
    if (ch === 'q' || ch === 'Q') queens++;
  }
  if (nonKingCount <= 10 || (queens === 0 && nonKingCount <= 14)) return 'endgame';
  if (ply <= 18) return 'opening';
  return 'middlegame';
}

export function calculateEloDelta(playerElo: number, opponentElo: number, score: 1 | 0.5 | 0, k = 32): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(k * (score - expected));
}

export function formatEvalLabel(scoreCp: number | null, mate: number | null): string {
  if (mate !== null) {
    return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`;
  }
  if (scoreCp === null) return '0.0';
  const pawns = scoreCp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
