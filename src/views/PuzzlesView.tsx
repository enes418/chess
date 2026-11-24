import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react';
import type { BoardThemeId, ChessPuzzle, PieceSetId, PlayerProfile } from '../types/chess';
import { CHESS_PUZZLES, getDailyPuzzle } from '../data/puzzles';
import { soundFX } from '../utils/sound';
import { ChessBoard } from '../components/ChessBoard';

interface PuzzlesViewProps {
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  profile: PlayerProfile | null;
  localSolvedIds: string[];
  onPuzzleSolved: (puzzle: ChessPuzzle, firstTry: boolean) => Promise<void>;
}

type CategoryFilter = 'all' | 'mate1' | 'mate2' | 'mate3' | 'tactic';

const DIFF_TR: Record<string, string> = {
  Easy: 'Kolay',
  Medium: 'Orta',
  Hard: 'Zor',
  Master: 'Usta',
};

export const PuzzlesView: React.FC<PuzzlesViewProps> = ({
  boardTheme,
  pieceSet,
  profile,
  localSolvedIds,
  onPuzzleSolved,
}) => {
  const daily = getDailyPuzzle();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>(daily.id);

  const filteredPuzzles = useMemo(
    () =>
      filter === 'all'
        ? CHESS_PUZZLES
        : CHESS_PUZZLES.filter((p) => p.category === filter),
    [filter],
  );

  const puzzle =
    CHESS_PUZZLES.find((p) => p.id === selectedPuzzleId) || filteredPuzzles[0] || daily;

  const [fen, setFen] = useState<string>(puzzle.fen);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [status, setStatus] = useState<'solving' | 'wrong' | 'solved'>('solving');
  const [showHint, setShowHint] = useState<boolean>(false);
  const [failedOnce, setFailedOnce] = useState<boolean>(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReplyTimer = () => {
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
  };

  const solvedSet = useMemo(
    () => new Set([...(profile?.solvedPuzzleIds || []), ...localSolvedIds]),
    [localSolvedIds, profile?.solvedPuzzleIds],
  );

  const playerColor: 'w' | 'b' = useMemo(() => {
    const c = new Chess(puzzle.fen);
    return c.turn();
  }, [puzzle.fen]);

  useEffect(() => {
    clearReplyTimer();
    setFen(puzzle.fen);
    setStepIndex(0);
    setStatus('solving');
    setShowHint(false);
    setFailedOnce(false);
    setLastMove(null);
    return () => clearReplyTimer();
  }, [puzzle]);

  const handleMove = (moveInput: {
    from: Square;
    to: Square;
    promotion?: 'q' | 'r' | 'b' | 'n';
  }): boolean => {
    if (status === 'solved') return false;

    const chess = new Chess(fen);
    try {
      const moved = chess.move(moveInput);
      if (!moved) return false;

      const playedUci = `${moved.from}${moved.to}${moved.promotion || ''}`;
      const expectedUci = puzzle.solutionUci[stepIndex];

      const isExpected =
        playedUci === expectedUci ||
        (stepIndex === puzzle.solutionUci.length - 1 && chess.isCheckmate());

      if (!isExpected) {
        soundFX.play('puzzleFail');
        setStatus('wrong');
        setFailedOnce(true);
        return false;
      }

      soundFX.play(chess.inCheck() ? 'check' : moved.captured ? 'capture' : 'move');
      setFen(chess.fen());
      setLastMove({ from: moved.from, to: moved.to });
      setStatus('solving');

      const nextIndex = stepIndex + 1;
      if (nextIndex >= puzzle.solutionUci.length) {
        setStatus('solved');
        soundFX.play('puzzleWin');
        void onPuzzleSolved(puzzle, !failedOnce);
        return true;
      }

      const replyUci = puzzle.solutionUci[nextIndex];
      setStepIndex(nextIndex);
      clearReplyTimer();
      replyTimerRef.current = setTimeout(() => {
        replyTimerRef.current = null;
        const replyChess = new Chess(chess.fen());
        const replyMove = replyChess.move({
          from: replyUci.slice(0, 2) as Square,
          to: replyUci.slice(2, 4) as Square,
          promotion: (replyUci[4] as 'q' | 'r' | 'b' | 'n') || undefined,
        });
        if (replyMove) {
          soundFX.play(replyMove.captured ? 'capture' : 'move');
          setFen(replyChess.fen());
          setLastMove({ from: replyMove.from, to: replyMove.to });
          setStepIndex(nextIndex + 1);
        }
      }, 360);

      return true;
    } catch {
      return false;
    }
  };

  const handleNextPuzzle = () => {
    const idx = filteredPuzzles.findIndex((p) => p.id === puzzle.id);
    const next = filteredPuzzles[(idx + 1) % filteredPuzzles.length];
    if (next) setSelectedPuzzleId(next.id);
  };

  const handleShowSolution = () => {
    const c = new Chess(puzzle.fen);
    let last: { from: string; to: string } | null = null;
    for (const uci of puzzle.solutionUci) {
      const m = c.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: (uci[4] as 'q' | 'r' | 'b' | 'n') || undefined,
      });
      if (m) last = { from: m.from, to: m.to };
    }
    setFen(c.fen());
    setLastMove(last);
    setStepIndex(puzzle.solutionUci.length);
    setStatus('solved');
    setFailedOnce(true);
  };

  const hintSquare = showHint ? puzzle.solutionUci[stepIndex]?.slice(0, 2) || null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Taktik Bulmacalar</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Bulmaca Puanı:{' '}
            <span className="font-mono tabular-nums text-amber-400 font-semibold">
              {profile?.puzzleRating ?? 1200}
            </span>{' '}
            · {solvedSet.size}/{CHESS_PUZZLES.length} çözüldü
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#262522] border border-white/[0.08]">
          {(
            [
              { id: 'all', label: 'Tümü' },
              { id: 'mate1', label: '1 Hamlede Mat' },
              { id: 'mate2', label: '2 Hamlede Mat' },
              { id: 'mate3', label: '3 Hamlede Mat' },
              { id: 'tactic', label: 'Taktik' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#81B64C] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 max-w-[580px] w-full mx-auto lg:mx-0 space-y-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#262522] border border-white/[0.08]">
            <div>
              <p className="text-xs text-amber-400 font-medium">
                {puzzle.id === daily.id ? 'Günün Bulmacası · ' : ''}
                {DIFF_TR[puzzle.difficulty] || puzzle.difficulty} · Puan {puzzle.rating}
              </p>
              <h2 className="text-base font-semibold text-white">{puzzle.title}</h2>
            </div>
            <span className="text-xs font-medium text-slate-300">
              {playerColor === 'w' ? 'Beyaz oynar' : 'Siyah oynar'}
            </span>
          </div>

          <ChessBoard
            fen={fen}
            orientation={playerColor}
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            interactive={status !== 'solved'}
            allowedColor={playerColor}
            lastMove={lastMove}
            highlightSquare={hintSquare}
            onMove={handleMove}
          />
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
            <p className="text-sm text-slate-200">{puzzle.description}</p>
            <p className="text-xs text-slate-400">{puzzle.themes.join(' · ')}</p>

            {status === 'wrong' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>En güçlü devam yolu değil. Başka bir hamle dene veya ipucu iste.</span>
              </div>
            )}

            {status === 'solved' && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#81B64C]/15 border border-[#81B64C]/40 text-xs text-[#BCE38A]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Bulmaca çözüldü! Harika taktik görüş.</span>
                </div>
                <button
                  type="button"
                  onClick={handleNextPuzzle}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#81B64C] hover:bg-[#95C95D] text-white font-semibold cursor-pointer"
                >
                  Sonraki
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {showHint && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{puzzle.hint}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-amber-300 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                İpucu
              </button>
              <button
                type="button"
                onClick={() => {
                  clearReplyTimer();
                  setFen(puzzle.fen);
                  setStepIndex(0);
                  setStatus('solving');
                  setLastMove(null);
                  setShowHint(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tekrar Dene
              </button>
              <button
                type="button"
                onClick={handleShowSolution}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Çözümü Göster
              </button>
              <button
                type="button"
                onClick={handleNextPuzzle}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold ml-auto cursor-pointer"
              >
                Sonraki Bulmaca
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#262522] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Bulmaca Arşivi ({filteredPuzzles.length})
              </span>
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <div className="divide-y divide-white/[0.05] max-h-72 overflow-y-auto">
              {filteredPuzzles.map((item) => {
                const isSolved = solvedSet.has(item.id);
                const isSelected = item.id === puzzle.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPuzzleId(item.id)}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#81B64C]/20' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {item.title}
                        {item.id === daily.id ? ' (Günlük)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {DIFF_TR[item.difficulty] || item.difficulty} · {item.themes[0]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono tabular-nums text-slate-300">
                        {item.rating}
                      </span>
                      {isSolved && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
