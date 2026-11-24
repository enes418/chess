export type AppSection =
  | 'dashboard'
  | 'play'
  | 'friends'
  | 'analysis'
  | 'puzzles'
  | 'openings'
  | 'profile'
  | 'admin';

export type PlaySubMode = 'ai' | 'local' | 'online' | 'practice';

export type DifficultyLevel =
  | 'beginner'
  | 'easy'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'master';

export type BoardThemeId = 'obsidian' | 'emerald' | 'walnut' | 'slate';
export type PieceSetId = 'staunton' | 'modern' | 'classic';

export type MoveClassification =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface EngineLine {
  multipv: number;
  depth: number;
  scoreCp: number | null; // White's perspective in centipawns
  mate: number | null; // White's perspective (+ for White mates, - for Black mates)
  pvUci: string[];
  pvSan: string[];
}

export interface PositionEvaluation {
  fen: string;
  depth: number;
  nodes?: number;
  lines: EngineLine[];
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  insight?: string | null;
}

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evalBeforeCp: number; // Clamped White-perspective eval for graph
  evalAfterCp: number;
  mateBefore: number | null;
  mateAfter: number | null;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  cpLoss: number;
  classification: MoveClassification;
  phase: 'opening' | 'middlegame' | 'endgame';
}

export interface GameAnalysisReport {
  moves: AnalyzedMove[];
  accuracyWhite: number;
  accuracyBlack: number;
  countsWhite: Record<MoveClassification, number>;
  countsBlack: Record<MoveClassification, number>;
  phaseAccuracyWhite: {
    opening: number | null;
    middlegame: number | null;
    endgame: number | null;
  };
  phaseAccuracyBlack: {
    opening: number | null;
    middlegame: number | null;
    endgame: number | null;
  };
  missedOpportunities: AnalyzedMove[];
  openingName: string;
}

export interface PlayerProfile {
  uid: string;
  username: string;
  role?: 'player' | 'admin';
  avatarUrl: string;
  elo: number;
  puzzleRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  solvedPuzzleIds: string[];
  favoriteOpenings: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminOverview {
  totalUsers: number;
  totalGames: number;
  activeRoomsCount: number;
  cheatEngineAllowed?: boolean;
  players: PlayerProfile[];
  rooms: MultiplayerRoom[];
  recentGames: GameRecord[];
}

export interface PublicFriend {
  uid: string;
  username: string;
  avatarUrl: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  role?: 'player' | 'admin';
}

export interface FriendRequestItem {
  id: string;
  fromUid: string;
  toUid: string;
  fromUser: PublicFriend;
  toUser: PublicFriend;
  createdAtMs: number;
}

export interface MatchChallengeItem {
  id: string;
  fromUid: string;
  toUid: string;
  fromUser: PublicFriend;
  toUser: PublicFriend;
  timeControlSec: number;
  incrementSec: number;
  challengerColor: 'w' | 'b' | 'random';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  roomCode?: string;
  createdAtMs: number;
}

export interface SocialState {
  friends: PublicFriend[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  incomingChallenges: MatchChallengeItem[];
  outgoingChallenges: MatchChallengeItem[];
}

export interface UserSettings {
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  soundEnabled: boolean;
}

export interface GameRecord {
  id: string;
  ownerId: string;
  participantIds: string[];
  mode: PlaySubMode;
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

export interface MultiplayerRoom {
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

export interface ChessPuzzle {
  id: string;
  title: string;
  category: 'mate1' | 'mate2' | 'mate3' | 'tactic';
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Master';
  rating: number;
  fen: string;
  solutionUci: string[]; // Alternating player move, opponent auto-reply, player move...
  themes: string[];
  hint: string;
  description: string;
}

export interface OpeningEntry {
  id: string;
  eco: string;
  name: string;
  movesSan: string[];
  description: string;
  whitePlan: string;
  blackPlan: string;
  keyThemes: string[];
  popularity: string;
}
