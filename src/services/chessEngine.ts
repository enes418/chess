import { Chess } from 'chess.js';
import type {
  AnalyzedMove,
  DifficultyLevel,
  EngineLine,
  GameAnalysisReport,
  MoveClassification,
  PositionEvaluation,
} from '../types/chess';
import {
  calculateMoveAccuracy,
  classifyCpLoss,
  cpToWinProbability,
  detectGamePhase,
  detectOpeningName,
  DIFFICULTY_CONFIG,
  INITIAL_FEN,
  parsePgnToPlies,
  pvUciToSan,
  uciToSingleSan,
} from './chessLogic';
import type { RawSearchSnapshot, SearchOptions } from '../engine/proChessEngine';
import type { EngineWorkerResponse } from '../workers/chessEngine.worker';

type PendingRequest = {
  id: number;
  fen: string;
  onUpdate?: (evalResult: PositionEvaluation) => void;
  resolve: (evalResult: PositionEvaluation) => void;
  reject: (err: Error) => void;
};

class ProChessEngineService {
  private worker: Worker | null = null;
  private currentSearch: PendingRequest | null = null;
  private queue: Promise<void> = Promise.resolve();
  private searchCounter = 0;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL('../workers/chessEngine.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (ev: MessageEvent<EngineWorkerResponse>) => {
      const msg = ev.data;
      const active = this.currentSearch;
      if (!active || !msg || msg.id !== active.id) return;

      if (msg.type === 'progress' && msg.snapshot) {
        active.onUpdate?.(this.mapSnapshot(msg.snapshot));
      } else if (msg.type === 'done' && msg.snapshot) {
        const finalEval = this.mapSnapshot(msg.snapshot);
        this.currentSearch = null;
        active.resolve(finalEval);
      } else if (msg.type === 'error') {
        this.currentSearch = null;
        active.reject(new Error(msg.error || 'Motor hatası'));
      }
    });

    worker.addEventListener('error', (err) => {
      const active = this.currentSearch;
      this.currentSearch = null;
      this.worker = null;
      active?.reject(new Error(err.message || 'Pro Satranç Motoru başlatılamadı'));
    });

    this.worker = worker;
    return worker;
  }

  private mapSnapshot(snap: RawSearchSnapshot): PositionEvaluation {
    const lines: EngineLine[] = snap.lines.map((l) => ({
      multipv: l.multipv,
      depth: l.depth,
      scoreCp: l.scoreCp,
      mate: l.mate,
      pvUci: l.pvUci,
      pvSan: pvUciToSan(snap.fen, l.pvUci, 8),
    }));
    const bestMoveUci = snap.bestMoveUci || lines[0]?.pvUci[0] || null;
    const bestMoveSan = uciToSingleSan(snap.fen, bestMoveUci);

    return {
      fen: snap.fen,
      depth: snap.depth,
      nodes: snap.nodes,
      lines,
      bestMoveUci,
      bestMoveSan,
      insight: snap.insight,
    };
  }

  public stopSearch(): void {
    if (this.worker && this.currentSearch) {
      this.worker.postMessage({ id: this.currentSearch.id, type: 'stop' });
    }
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  public async evaluatePosition(
    fen: string,
    options: SearchOptions = {},
    onUpdate?: (evalResult: PositionEvaluation) => void,
  ): Promise<PositionEvaluation> {
    const requestId = ++this.searchCounter;
    this.stopSearch();

    return this.runSerialized(async () => {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        const mateScore = chess.isCheckmate() ? (chess.turn() === 'w' ? -10000 : 10000) : 0;
        const result: PositionEvaluation = {
          fen,
          depth: 0,
          nodes: 1,
          lines: [
            {
              multipv: 1,
              depth: 0,
              scoreCp: mateScore,
              mate: chess.isCheckmate() ? (chess.turn() === 'w' ? -1 : 1) : null,
              pvUci: [],
              pvSan: [],
            },
          ],
          bestMoveUci: null,
          bestMoveSan: null,
          insight: chess.isCheckmate() ? 'Şah mat konumu.' : 'Oyun berabere bitti.',
        };
        onUpdate?.(result);
        return result;
      }

      if (onUpdate && requestId < this.searchCounter) {
        return {
          fen,
          depth: 0,
          lines: [],
          bestMoveUci: null,
          bestMoveSan: null,
          insight: null,
        };
      }

      const worker = this.ensureWorker();
      return new Promise<PositionEvaluation>((resolve, reject) => {
        this.currentSearch = {
          id: requestId,
          fen,
          onUpdate,
          resolve,
          reject,
        };
        worker.postMessage({
          id: requestId,
          type: 'search',
          fen,
          options,
        });
      });
    });
  }

  public async getAiMove(
    fen: string,
    difficulty: DifficultyLevel,
    thinkingTimeMs?: number,
  ): Promise<{ uci: string | null; evaluation: PositionEvaluation }> {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    const movetimeMs = thinkingTimeMs ?? cfg.defaultTimeMs;
    const multiPv = difficulty === 'beginner' || difficulty === 'easy' ? 3 : 1;

    const evaluation = await this.evaluatePosition(fen, {
      skillLevel: cfg.skillLevel,
      depth: cfg.depth,
      movetimeMs,
      multiPv,
    });

    if (difficulty === 'beginner' && evaluation.lines.length >= 2) {
      const roll = Math.random();
      if (roll < 0.35) {
        const idx = Math.min(evaluation.lines.length - 1, roll < 0.15 ? 2 : 1);
        const altMove = evaluation.lines[idx]?.pvUci[0];
        if (altMove) return { uci: altMove, evaluation };
      }
    }

    return { uci: evaluation.bestMoveUci, evaluation };
  }

  public async analyzeFullGame(
    pgn: string,
    onProgress?: (completed: number, total: number) => void,
    customInitialFen?: string,
  ): Promise<GameAnalysisReport> {
    const parsed = parsePgnToPlies(pgn);
    const plies = parsed.plies;
    const initialFen = customInitialFen || parsed.initialFen || INITIAL_FEN;

    if (plies.length === 0) {
      return {
        moves: [],
        accuracyWhite: 100,
        accuracyBlack: 100,
        countsWhite: this.emptyCounts(),
        countsBlack: this.emptyCounts(),
        phaseAccuracyWhite: { opening: null, middlegame: null, endgame: null },
        phaseAccuracyBlack: { opening: null, middlegame: null, endgame: null },
        missedOpportunities: [],
        openingName: 'Başlangıç Konumu',
      };
    }

    const totalEvals = plies.length + 1;
    const positionEvals: PositionEvaluation[] = [];

    positionEvals.push(
      await this.evaluatePosition(initialFen, { depth: 7, movetimeMs: 180, multiPv: 1 }),
    );
    onProgress?.(1, totalEvals);

    for (let i = 0; i < plies.length; i++) {
      const evalRes = await this.evaluatePosition(plies[i].fenAfter, {
        depth: 7,
        movetimeMs: 180,
        multiPv: 1,
      });
      positionEvals.push(evalRes);
      onProgress?.(i + 2, totalEvals);
    }

    const analyzedMoves: AnalyzedMove[] = [];
    const countsWhite = this.emptyCounts();
    const countsBlack = this.emptyCounts();
    const accWhite: number[] = [];
    const accBlack: number[] = [];
    const phaseAccW: Record<'opening' | 'middlegame' | 'endgame', number[]> = {
      opening: [],
      middlegame: [],
      endgame: [],
    };
    const phaseAccB: Record<'opening' | 'middlegame' | 'endgame', number[]> = {
      opening: [],
      middlegame: [],
      endgame: [],
    };
    const missedOpportunities: AnalyzedMove[] = [];
    const sanList = plies.map((p) => p.san);

    for (let i = 0; i < plies.length; i++) {
      const ply = plies[i];
      const evalBefore = positionEvals[i];
      const evalAfter = positionEvals[i + 1];

      const beforeLine = evalBefore.lines[0];
      const afterLine = evalAfter.lines[0];

      const rawBeforeCp = this.normalizeMateToCp(beforeLine?.scoreCp ?? 0, beforeLine?.mate ?? null);
      const rawAfterCp = this.normalizeMateToCp(afterLine?.scoreCp ?? 0, afterLine?.mate ?? null);

      const isWhite = ply.color === 'w';
      const bestMoveUci = evalBefore.bestMoveUci;
      const bestMoveSan = evalBefore.bestMoveSan;
      const isBestMove = bestMoveUci === ply.uci;

      const cpLoss = isBestMove
        ? 0
        : Math.max(0, isWhite ? rawBeforeCp - rawAfterCp : rawAfterCp - rawBeforeCp);

      const winProbBefore = cpToWinProbability(isWhite ? rawBeforeCp : -rawBeforeCp);
      const winProbAfter = cpToWinProbability(isWhite ? rawAfterCp : -rawAfterCp);
      const moveAcc = isBestMove ? 100 : calculateMoveAccuracy(winProbBefore, winProbAfter);

      const wasSacrifice = this.detectMaterialDrop(ply.fenBefore, ply.fenAfter, ply.color);
      const classification = classifyCpLoss(cpLoss, isBestMove, wasSacrifice);
      const phase = detectGamePhase(ply.fenBefore, ply.ply);

      const analyzed: AnalyzedMove = {
        ply: ply.ply,
        moveNumber: ply.moveNumber,
        color: ply.color,
        san: ply.san,
        uci: ply.uci,
        from: ply.from,
        to: ply.to,
        fenBefore: ply.fenBefore,
        fenAfter: ply.fenAfter,
        evalBeforeCp: Math.max(-1000, Math.min(1000, rawBeforeCp)),
        evalAfterCp: Math.max(-1000, Math.min(1000, rawAfterCp)),
        mateBefore: beforeLine?.mate ?? null,
        mateAfter: afterLine?.mate ?? null,
        bestMoveUci,
        bestMoveSan,
        cpLoss,
        classification,
        phase,
      };

      analyzedMoves.push(analyzed);

      if (isWhite) {
        countsWhite[classification]++;
        accWhite.push(moveAcc);
        phaseAccW[phase].push(moveAcc);
      } else {
        countsBlack[classification]++;
        accBlack.push(moveAcc);
        phaseAccB[phase].push(moveAcc);
      }

      if ((classification === 'mistake' || classification === 'blunder') && bestMoveSan) {
        missedOpportunities.push(analyzed);
      }
    }

    const avg = (arr: number[]) =>
      arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

    return {
      moves: analyzedMoves,
      accuracyWhite: avg(accWhite) ?? 100,
      accuracyBlack: avg(accBlack) ?? 100,
      countsWhite,
      countsBlack,
      phaseAccuracyWhite: {
        opening: avg(phaseAccW.opening),
        middlegame: avg(phaseAccW.middlegame),
        endgame: avg(phaseAccW.endgame),
      },
      phaseAccuracyBlack: {
        opening: avg(phaseAccB.opening),
        middlegame: avg(phaseAccB.middlegame),
        endgame: avg(phaseAccB.endgame),
      },
      missedOpportunities,
      openingName: detectOpeningName(sanList),
    };
  }

  private normalizeMateToCp(scoreCp: number, mate: number | null): number {
    if (mate !== null) {
      return mate > 0 ? 1500 - Math.min(10, mate) * 20 : -1500 + Math.min(10, Math.abs(mate)) * 20;
    }
    return scoreCp;
  }

  private detectMaterialDrop(fenBefore: string, fenAfter: string, color: 'w' | 'b'): boolean {
    const val = (fen: string) => {
      const weights: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
      let score = 0;
      const board = fen.split(' ')[0] || '';
      for (const ch of board) {
        const lower = ch.toLowerCase();
        if (!weights[lower]) continue;
        const isW = ch >= 'A' && ch <= 'Z';
        if ((color === 'w' && isW) || (color === 'b' && !isW)) {
          score += weights[lower];
        }
      }
      return score;
    };
    return val(fenAfter) < val(fenBefore) - 1;
  }

  private emptyCounts(): Record<MoveClassification, number> {
    return {
      brilliant: 0,
      best: 0,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
  }
}

export const chessEngine = new ProChessEngineService();
