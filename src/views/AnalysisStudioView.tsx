import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FlipVertical2,
  Loader2,
  RotateCcw,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type {
  BoardThemeId,
  GameAnalysisReport,
  MoveClassification,
  PieceSetId,
  PositionEvaluation,
} from '../types/chess';
import {
  detectOpeningName,
  formatEvalLabel,
  INITIAL_FEN,
  parsePgnToPlies,
  validateFen,
} from '../services/chessLogic';
import { chessEngine } from '../services/chessEngine';
import { soundFX } from '../utils/sound';
import { ChessBoard, type BoardArrow } from '../components/ChessBoard';
import { EvalBar } from '../components/EvalBar';
import { GameReportPanel } from '../components/GameReportPanel';

interface AnalysisStudioViewProps {
  initialPgn?: string;
  initialFen?: string;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
}

const SAMPLE_GAME_PGN = `[Event "Opera Game"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#`;

interface TimelineNode {
  fen: string;
  san: string | null;
  from: string | null;
  to: string | null;
}

const BADGE_CLASS: Record<MoveClassification, { text: string; color: string }> = {
  brilliant: { text: '!!', color: 'text-cyan-400' },
  best: { text: '★', color: 'text-emerald-400' },
  excellent: { text: '✓', color: 'text-emerald-300' },
  good: { text: '', color: 'text-slate-400' },
  inaccuracy: { text: '?!', color: 'text-amber-300' },
  mistake: { text: '?', color: 'text-orange-400' },
  blunder: { text: '??', color: 'text-rose-400' },
};

const CLASS_TR: Record<MoveClassification, string> = {
  brilliant: 'Harika Hamle',
  best: 'En İyi',
  excellent: 'Mükemmel',
  good: 'İyi',
  inaccuracy: 'Küçük Hata',
  mistake: 'Hata',
  blunder: 'Büyük Hata',
};

export const AnalysisStudioView: React.FC<AnalysisStudioViewProps> = ({
  initialPgn,
  initialFen,
  boardTheme,
  pieceSet,
}) => {
  const [timeline, setTimeline] = useState<TimelineNode[]>([
    { fen: initialFen || INITIAL_FEN, san: null, from: null, to: null },
  ]);
  const [cursor, setCursor] = useState<number>(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [engineEnabled, setEngineEnabled] = useState<boolean>(true);
  const [engineDepth, setEngineDepth] = useState<number>(10);
  const [evaluation, setEvaluation] = useState<PositionEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const [fenInput, setFenInput] = useState<string>(initialFen || INITIAL_FEN);
  const [pgnInput, setPgnInput] = useState<string>(initialPgn || '');
  const [inputError, setInputError] = useState<string | null>(null);

  const [fullReport, setFullReport] = useState<GameAnalysisReport | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditProgress, setAuditProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const lastLoadedRef = useRef<string>('');

  useEffect(() => {
    const sig = `${initialPgn || ''}::${initialFen || ''}`;
    if (!sig || sig === '::' || sig === lastLoadedRef.current) return;
    lastLoadedRef.current = sig;

    if (initialPgn && initialPgn.trim()) {
      handleLoadPgn(initialPgn);
    } else if (initialFen && initialFen.trim()) {
      handleLoadFen(initialFen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPgn, initialFen]);

  const currentNode = timeline[cursor] || timeline[0];
  const currentFen = currentNode.fen;

  useEffect(() => {
    setFenInput(currentFen);
    if (!engineEnabled) {
      chessEngine.stopSearch();
      setIsEvaluating(false);
      return;
    }

    let cancelled = false;
    setIsEvaluating(true);

    chessEngine
      .evaluatePosition(
        currentFen,
        { depth: engineDepth, movetimeMs: 1400, multiPv: 3 },
        (liveEval) => {
          if (!cancelled) setEvaluation(liveEval);
        },
      )
      .then((finalEval) => {
        if (!cancelled) {
          setEvaluation(finalEval);
          setIsEvaluating(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsEvaluating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentFen, engineDepth, engineEnabled]);

  const handleLoadFen = useCallback((rawFen: string) => {
    const trimmed = rawFen.trim();
    const check = validateFen(trimmed);
    if (!check.valid) {
      setInputError(check.error || 'Geçersiz FEN dizilimi.');
      return;
    }
    setInputError(null);
    setTimeline([{ fen: trimmed, san: null, from: null, to: null }]);
    setCursor(0);
    setFullReport(null);
  }, []);

  const handleLoadPgn = useCallback((rawPgn: string) => {
    const trimmed = rawPgn.trim();
    if (!trimmed) {
      setInputError('Önce geçerli bir PGN yapıştırın.');
      return;
    }
    const parsed = parsePgnToPlies(trimmed);
    if (!parsed.valid) {
      setInputError(parsed.error || 'PGN çözümlenemedi.');
      return;
    }
    setInputError(null);
    setPgnInput(trimmed);
    const nodes: TimelineNode[] = [
      { fen: parsed.initialFen, san: null, from: null, to: null },
      ...parsed.plies.map((p) => ({
        fen: p.fenAfter,
        san: p.san,
        from: p.from,
        to: p.to,
      })),
    ];
    setTimeline(nodes);
    setCursor(nodes.length - 1);
    setFullReport(null);
  }, []);

  const handleBoardMove = (moveInput: {
    from: Square;
    to: Square;
    promotion?: 'q' | 'r' | 'b' | 'n';
  }): boolean => {
    const chess = new Chess(currentFen);
    try {
      const moved = chess.move(moveInput);
      if (!moved) return false;

      if (chess.inCheck()) soundFX.play('check');
      else if (moved.captured) soundFX.play('capture');
      else soundFX.play('move');

      const nextNode: TimelineNode = {
        fen: chess.fen(),
        san: moved.san,
        from: moved.from,
        to: moved.to,
      };
      const truncated = timeline.slice(0, cursor + 1);
      const updated = [...truncated, nextNode];
      setTimeline(updated);
      setCursor(updated.length - 1);
      setFullReport(null);
      return true;
    } catch {
      return false;
    }
  };

  const handlePlayPvLine = (pvUci: string[]) => {
    if (pvUci.length === 0) return;
    const first = pvUci[0];
    handleBoardMove({
      from: first.slice(0, 2) as Square,
      to: first.slice(2, 4) as Square,
      promotion: (first[4] as 'q' | 'r' | 'b' | 'n') || undefined,
    });
  };

  const handleRunFullAudit = async () => {
    if (timeline.length <= 1 || isAuditing) return;
    const baseChess = new Chess(timeline[0].fen);
    for (let i = 1; i < timeline.length; i++) {
      const s = timeline[i].san;
      if (s) baseChess.move(s);
    }
    const generatedPgn = baseChess.pgn();
    setIsAuditing(true);
    setAuditProgress({ done: 0, total: timeline.length });
    try {
      const rep = await chessEngine.analyzeFullGame(
        generatedPgn,
        (done, total) => setAuditProgress({ done, total }),
        timeline[0].fen,
      );
      setFullReport(rep);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleReset = () => {
    setTimeline([{ fen: INITIAL_FEN, san: null, from: null, to: null }]);
    setCursor(0);
    setPgnInput('');
    setInputError(null);
    setFullReport(null);
  };

  const topLine = evaluation?.lines[0];
  const arrows: BoardArrow[] = useMemo(() => {
    if (!engineEnabled || !evaluation?.lines.length) return [];
    const uci = evaluation.lines[0]?.pvUci[0];
    if (!uci || uci.length < 4) return [];
    return [
      {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        color: 'rgba(16, 185, 129, 0.9)',
      },
    ];
  }, [engineEnabled, evaluation]);

  const sanSequence = useMemo(
    () => timeline.slice(1).map((n) => n.san || ''),
    [timeline],
  );
  const openingName = useMemo(() => detectOpeningName(sanSequence), [sanSequence]);

  const movePairs = useMemo(() => {
    const startFenParts = (timeline[0]?.fen || INITIAL_FEN).split(' ');
    const startsWithBlack = startFenParts[1] === 'b';
    const startMoveNum = Math.max(1, parseInt(startFenParts[5] || '1', 10) || 1);

    const pairs: {
      num: number;
      white?: { ply: number; san: string };
      black?: { ply: number; san: string };
    }[] = [];

    let i = 1;
    let moveNum = startMoveNum;
    if (startsWithBlack && i < timeline.length) {
      pairs.push({
        num: moveNum,
        black: { ply: i, san: timeline[i].san || '' },
      });
      i++;
      moveNum++;
    }

    while (i < timeline.length) {
      pairs.push({
        num: moveNum,
        white: { ply: i, san: timeline[i].san || '' },
        black: timeline[i + 1] ? { ply: i + 1, san: timeline[i + 1].san || '' } : undefined,
      });
      i += 2;
      moveNum++;
    }
    return pairs;
  }, [timeline]);

  const activeAnalyzedMove = fullReport?.moves[cursor - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Admin Motor Stüdyosu</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Yöneticiye özel Pro Satranç Motoru · Çoklu varyant &amp; derin analiz · {openingName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleLoadPgn(SAMPLE_GAME_PGN)}
            className="px-3 py-1.5 rounded-lg bg-[#262522] hover:bg-[#363430] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            Morphy Opera Maçını Yükle
          </button>
          <button
            type="button"
            disabled={timeline.length <= 1 || isAuditing}
            onClick={handleRunFullAudit}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            {isAuditing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analiz Ediliyor ({auditProgress.done}/{auditProgress.total})
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Tam Oyunu Analiz Et
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-stretch gap-3 max-w-[630px] w-full mx-auto lg:mx-0">
            <EvalBar
              scoreCp={topLine?.scoreCp ?? 0}
              mate={topLine?.mate ?? null}
              orientation={orientation}
            />
            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={currentFen}
                orientation={orientation}
                boardTheme={boardTheme}
                pieceSet={pieceSet}
                interactive={true}
                allowedColor="both"
                lastMove={
                  currentNode.from && currentNode.to
                    ? { from: currentNode.from, to: currentNode.to }
                    : null
                }
                arrows={arrows}
                onMove={handleBoardMove}
              />
            </div>
          </div>

          <div className="max-w-[630px] w-full mx-auto lg:mx-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#262522] border border-white/[0.08]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCursor(0)}
                disabled={cursor === 0}
                title="İlk hamle"
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
                disabled={cursor === 0}
                title="Önceki hamle"
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursor((c) => Math.min(timeline.length - 1, c + 1))}
                disabled={cursor >= timeline.length - 1}
                title="Sonraki hamle"
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursor(timeline.length - 1)}
                disabled={cursor >= timeline.length - 1}
                title="Son hamle"
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <FlipVertical2 className="w-3.5 h-3.5" />
                Çevir
              </button>
              <button
                type="button"
                onClick={() => {
                  if (cursor > 0) {
                    setTimeline((t) => t.slice(0, cursor));
                    setCursor((c) => c - 1);
                  }
                }}
                disabled={cursor === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] disabled:opacity-40 border border-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Kırp
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Sıfırla
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">Chess Arena Pro Motor</span>
                {isEvaluating && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={engineDepth}
                  onChange={(e) => setEngineDepth(Number(e.target.value))}
                  className="px-2 py-1 rounded bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200"
                >
                  <option value={8}>Derinlik 8</option>
                  <option value={10}>Derinlik 10</option>
                  <option value={13}>Derinlik 13</option>
                </select>
                <button
                  type="button"
                  onClick={() => setEngineEnabled((v) => !v)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    engineEnabled
                      ? 'bg-[#81B64C] text-white'
                      : 'bg-[#1E1D1A] border border-white/10 text-slate-300'
                  }`}
                >
                  {engineEnabled ? 'Motor Açık' : 'Motor Kapalı'}
                </button>
              </div>
            </div>

            {engineEnabled && evaluation?.lines.length ? (
              <div className="space-y-2">
                {evaluation.lines.map((line) => {
                  const scoreStr = formatEvalLabel(line.scoreCp, line.mate);
                  const isWhiteEdge =
                    line.mate !== null ? line.mate > 0 : (line.scoreCp ?? 0) >= 0;
                  return (
                    <button
                      key={line.multipv}
                      type="button"
                      onClick={() => handlePlayPvLine(line.pvUci)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-[#32302B] border border-white/[0.06] flex items-center gap-3 transition-colors cursor-pointer"
                    >
                      <span
                        className={`w-14 text-center py-0.5 rounded font-mono text-xs font-bold tabular-nums shrink-0 ${
                          isWhiteEdge
                            ? 'bg-slate-100 text-slate-900'
                            : 'bg-slate-800 text-slate-100'
                        }`}
                      >
                        {scoreStr}
                      </span>
                      <span className="text-xs font-mono text-slate-200 truncate">
                        {line.pvSan.join(' ')}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 ml-auto shrink-0">
                        d{line.depth}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {engineEnabled ? 'En iyi devam yolları hesaplanıyor...' : 'Motor duraklatıldı.'}
              </p>
            )}

            {activeAnalyzedMove && (
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  Hamle {activeAnalyzedMove.moveNumber}
                  {activeAnalyzedMove.color === 'w' ? '.' : '...'} {activeAnalyzedMove.san}:{' '}
                  <span className="font-semibold text-white">
                    {CLASS_TR[activeAnalyzedMove.classification]}
                  </span>
                </span>
                {activeAnalyzedMove.bestMoveSan &&
                  activeAnalyzedMove.bestMoveSan !== activeAnalyzedMove.san && (
                    <span className="font-mono text-emerald-400">
                      En iyisi: {activeAnalyzedMove.bestMoveSan}
                    </span>
                  )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Hamleler ve Varyantlar</span>
              <span className="font-mono tabular-nums">
                Hamle {cursor}/{timeline.length - 1}
              </span>
            </div>
            <div className="rounded-lg bg-[#1E1D1A] border border-white/[0.06] p-2.5 h-40 overflow-y-auto font-mono text-xs tabular-nums">
              {movePairs.length === 0 ? (
                <p className="text-slate-500 text-center py-10">
                  Tahtada serbestçe hamle yapın veya aşağıya PGN yapıştırın.
                </p>
              ) : (
                <div className="space-y-1">
                  {movePairs.map((pair) => {
                    const wCls = fullReport?.moves[pair.white!.ply - 1]?.classification;
                    const bCls = pair.black
                      ? fullReport?.moves[pair.black.ply - 1]?.classification
                      : undefined;
                    return (
                      <div key={pair.num} className="grid grid-cols-12 items-center gap-1">
                        <span className="col-span-2 text-slate-500 pl-1">{pair.num}.</span>
                        {pair.white ? (
                          <button
                            type="button"
                            onClick={() => setCursor(pair.white!.ply)}
                            className={`col-span-5 text-left px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-between ${
                              cursor === pair.white.ply
                                ? 'bg-[#81B64C]/25 text-emerald-200 font-semibold'
                                : 'text-slate-200 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span>{pair.white.san}</span>
                            {wCls && BADGE_CLASS[wCls].text && (
                              <span className={BADGE_CLASS[wCls].color}>
                                {BADGE_CLASS[wCls].text}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="col-span-5 px-2 py-0.5 text-slate-500">...</span>
                        )}
                        {pair.black && (
                          <button
                            type="button"
                            onClick={() => setCursor(pair.black!.ply)}
                            className={`col-span-5 text-left px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center justify-between ${
                              cursor === pair.black.ply
                                ? 'bg-[#81B64C]/25 text-emerald-200 font-semibold'
                                : 'text-slate-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span>{pair.black.san}</span>
                            {bCls && BADGE_CLASS[bCls].text && (
                              <span className={BADGE_CLASS[bCls].color}>
                                {BADGE_CLASS[bCls].text}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Konum FEN</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => handleLoadFen(fenInput)}
                  className="px-3 py-1.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-medium text-white cursor-pointer"
                >
                  FEN Yükle
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">PGN Yapıştır</label>
              <textarea
                rows={3}
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
                placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6..."
                className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200 placeholder:text-slate-600"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                {inputError ? (
                  <p className="text-xs text-rose-400">{inputError}</p>
                ) : (
                  <span className="text-[11px] text-slate-500">Standart SAN PGN desteklenir</span>
                )}
                <button
                  type="button"
                  onClick={() => handleLoadPgn(pgnInput)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-medium text-white cursor-pointer"
                >
                  PGN Aktar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {fullReport && (
        <div className="pt-2">
          <GameReportPanel
            report={fullReport}
            whiteName="Beyaz"
            blackName="Siyah"
            selectedPly={cursor}
            onSelectPly={(ply) => setCursor(ply)}
          />
        </div>
      )}
    </div>
  );
};
