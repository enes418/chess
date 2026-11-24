import React, { useEffect, useMemo, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import type { BoardThemeId, PieceSetId } from '../types/chess';
import { BOARD_THEMES, getLegalMovesBySquare, isPromotionMove } from '../services/chessLogic';
import { ChessPieceSvg } from './ChessPieces';

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface ChessBoardProps {
  fen: string;
  orientation?: 'w' | 'b';
  boardTheme?: BoardThemeId;
  pieceSet?: PieceSetId;
  interactive?: boolean;
  allowedColor?: 'w' | 'b' | 'both' | 'none';
  lastMove?: { from: string; to: string } | null;
  arrows?: BoardArrow[];
  highlightSquare?: string | null;
  onMove: (move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean | void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation = 'w',
  boardTheme = 'emerald',
  pieceSet = 'staunton',
  interactive = true,
  allowedColor = 'both',
  lastMove = null,
  arrows = [],
  highlightSquare = null,
  onMove,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; color: 'w' | 'b' } | null>(null);

  useEffect(() => {
    setSelectedSquare(null);
    setDragFrom(null);
    setHoverSquare(null);
    setPendingPromotion(null);
  }, [fen]);

  const theme = BOARD_THEMES[boardTheme];

  const { chess, legalMovesMap, checkedKingSquare } = useMemo(() => {
    const instance = new Chess();
    try {
      instance.load(fen);
    } catch {
      // Hatalı FEN durumunda varsayılan dizilim
    }
    const movesMap = getLegalMovesBySquare(instance);
    let kingSq: string | null = null;
    if (instance.inCheck()) {
      const turn = instance.turn();
      const board = instance.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.type === 'k' && p.color === turn) {
            kingSq = `${FILES[c]}${8 - r}`;
          }
        }
      }
    }
    return { chess: instance, legalMovesMap: movesMap, checkedKingSquare: kingSq };
  }, [fen]);

  const orderedRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const orderedFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  const activeSquare = dragFrom || selectedSquare;
  const activeMoves: Move[] = activeSquare ? legalMovesMap[activeSquare] || [] : [];
  const legalTargets = new Set(activeMoves.map((m) => m.to));

  const canControlPiece = (square: Square): boolean => {
    if (!interactive || allowedColor === 'none') return false;
    const piece = chess.get(square);
    if (!piece) return false;
    if (piece.color !== chess.turn()) return false;
    if (allowedColor !== 'both' && piece.color !== allowedColor) return false;
    return true;
  };

  const executeMove = (from: Square, to: Square) => {
    if (isPromotionMove(chess, from, to)) {
      const piece = chess.get(from);
      if (piece) {
        setPendingPromotion({ from, to, color: piece.color });
        setSelectedSquare(null);
        setDragFrom(null);
        return;
      }
    }
    onMove({ from, to });
    setSelectedSquare(null);
    setDragFrom(null);
    setHoverSquare(null);
  };

  const handleSquareClick = (square: Square) => {
    if (!interactive || allowedColor === 'none') return;

    if (selectedSquare && legalTargets.has(square)) {
      executeMove(selectedSquare, square);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (canControlPiece(square)) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, square: Square) => {
    if (!canControlPiece(square)) {
      e.preventDefault();
      return;
    }
    setDragFrom(square);
    setSelectedSquare(square);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', square);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetSquare: Square) => {
    e.preventDefault();
    const fromSquare = (dragFrom || e.dataTransfer.getData('text/plain')) as Square;
    setHoverSquare(null);
    setDragFrom(null);
    if (!fromSquare || fromSquare === targetSquare) return;

    const legal = (legalMovesMap[fromSquare] || []).some((m) => m.to === targetSquare);
    if (legal) {
      executeMove(fromSquare, targetSquare);
    }
  };

  const squareToPercentCenter = (sq: string): { x: number; y: number } | null => {
    if (sq.length < 2) return null;
    const fileIdx = FILES.indexOf(sq[0]);
    const rankIdx = RANKS.indexOf(sq[1]);
    if (fileIdx === -1 || rankIdx === -1) return null;

    const visualCol = orientation === 'w' ? fileIdx : 7 - fileIdx;
    const visualRow = orientation === 'w' ? rankIdx : 7 - rankIdx;
    return {
      x: visualCol * 12.5 + 6.25,
      y: visualRow * 12.5 + 6.25,
    };
  };

  return (
    <div className="relative w-full aspect-square select-none rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-[#1E1D1A]">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {orderedRanks.map((rank, rIdx) =>
          orderedFiles.map((file, fIdx) => {
            const square = `${file}${rank}` as Square;
            const fileIndex = FILES.indexOf(file);
            const rankIndex = RANKS.indexOf(rank);
            const isLight = (fileIndex + rankIndex) % 2 === 0;
            const isLastMove = lastMove?.from === square || lastMove?.to === square;
            const isSelected = selectedSquare === square || dragFrom === square;
            const isLegalTarget = legalTargets.has(square);
            const isHintHighlight = highlightSquare === square;
            const isCheckedKing = checkedKingSquare === square;
            const isHoveredDrop = hoverSquare === square && isLegalTarget;

            const piece = chess.get(square);
            const pieceCode = piece ? `${piece.color}${piece.type.toUpperCase()}` : null;

            let bg = isLight ? theme.light : theme.dark;
            if (isLastMove || isSelected) {
              bg = isLight ? theme.highlightLight : theme.highlightDark;
            }

            const showRankCoord = fIdx === 0;
            const showFileCoord = rIdx === 7;
            const coordColor = isLight ? theme.coordLight : theme.coordDark;

            return (
              <div
                key={square}
                onClick={() => handleSquareClick(square)}
                onDragOver={(e) => {
                  if (dragFrom && isLegalTarget) {
                    e.preventDefault();
                    setHoverSquare(square);
                  }
                }}
                onDragLeave={() => {
                  if (hoverSquare === square) setHoverSquare(null);
                }}
                onDrop={(e) => handleDrop(e, square)}
                style={{ backgroundColor: bg }}
                className={`relative flex items-center justify-center transition-colors duration-100 ${
                  canControlPiece(square) ? 'cursor-grab active:cursor-grabbing' : isLegalTarget ? 'cursor-pointer' : 'cursor-default'
                }`}
                data-square={square}
              >
                {/* Şah uyarısı parlama efekti */}
                {isCheckedKing && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(220,38,38,0.85) 0%, rgba(220,38,38,0.45) 55%, rgba(220,38,38,0) 80%)',
                    }}
                  />
                )}

                {/* İpucu karesi çerçevesi */}
                {isHintHighlight && (
                  <div className="absolute inset-0.5 border-2 border-amber-400 rounded-sm pointer-events-none" />
                )}

                {/* Sürükle-bırak hedef vurgusu */}
                {isHoveredDrop && (
                  <div className="absolute inset-0 border-2 border-emerald-400/90 bg-emerald-400/15 pointer-events-none" />
                )}

                {/* Satır koordinatı */}
                {showRankCoord && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute top-0.5 left-1 text-[10px] font-mono font-semibold leading-none opacity-80 pointer-events-none"
                  >
                    {rank}
                  </span>
                )}

                {/* Sütun koordinatı */}
                {showFileCoord && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute bottom-0.5 right-1 text-[10px] font-mono font-semibold leading-none opacity-80 pointer-events-none"
                  >
                    {file}
                  </span>
                )}

                {/* Yasal hamle noktası / alış halkası */}
                {isLegalTarget && !pieceCode && (
                  <div className="w-[28%] h-[28%] rounded-full bg-slate-950/35 pointer-events-none z-10" />
                )}
                {isLegalTarget && pieceCode && (
                  <div className="absolute inset-[6%] rounded-full border-[3.5px] border-slate-950/35 pointer-events-none z-10" />
                )}

                {/* Taş */}
                {pieceCode && (
                  <div
                    draggable={canControlPiece(square)}
                    onDragStart={(e) => handleDragStart(e, square)}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setHoverSquare(null);
                    }}
                    className={`w-[84%] h-[84%] z-20 transition-transform duration-150 ${
                      isSelected ? 'scale-105' : 'hover:scale-[1.03]'
                    }`}
                  >
                    <ChessPieceSvg piece={pieceCode} pieceSet={pieceSet} />
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>

      {/* En iyi hamle / analiz okları */}
      {arrows.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full pointer-events-none z-30"
        >
          <defs>
            <marker
              id="arrow-emerald"
              markerWidth="4"
              markerHeight="4"
              refX="2.5"
              refY="2"
              orient="auto"
            >
              <polygon points="0 0, 4 2, 0 4" fill="rgba(16, 185, 129, 0.85)" />
            </marker>
            <marker
              id="arrow-gold"
              markerWidth="4"
              markerHeight="4"
              refX="2.5"
              refY="2"
              orient="auto"
            >
              <polygon points="0 0, 4 2, 0 4" fill="rgba(245, 158, 11, 0.85)" />
            </marker>
          </defs>
          {arrows.map((arrow, idx) => {
            const start = squareToPercentCenter(arrow.from);
            const end = squareToPercentCenter(arrow.to);
            if (!start || !end) return null;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return null;
            const shorten = 2.4;
            const endX = end.x - (dx / len) * shorten;
            const endY = end.y - (dy / len) * shorten;
            const isPrimary = idx === 0;
            return (
              <line
                key={`${arrow.from}-${arrow.to}-${idx}`}
                x1={start.x}
                y1={start.y}
                x2={endX}
                y2={endY}
                stroke={arrow.color || (isPrimary ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.72)')}
                strokeWidth={isPrimary ? 2.1 : 1.5}
                strokeLinecap="round"
                markerEnd={isPrimary ? 'url(#arrow-emerald)' : 'url(#arrow-gold)'}
              />
            );
          })}
        </svg>
      )}

      {/* Piyon Terfi Seçim Penceresi */}
      {pendingPromotion && (
        <div className="absolute inset-0 z-40 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#262522] border border-white/15 rounded-xl p-4 shadow-2xl">
            <p className="text-xs font-medium text-slate-300 mb-3 text-center">
              Terfi Edilecek Taşı Seçin
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                <button
                  key={promo}
                  type="button"
                  onClick={() => {
                    onMove({
                      from: pendingPromotion.from,
                      to: pendingPromotion.to,
                      promotion: promo,
                    });
                    setPendingPromotion(null);
                  }}
                  className="w-14 h-14 rounded-lg bg-[#1E1D1A] hover:bg-[#81B64C]/25 border border-white/10 hover:border-[#81B64C]/50 p-2 transition-colors flex items-center justify-center cursor-pointer"
                >
                  <ChessPieceSvg
                    piece={`${pendingPromotion.color}${promo.toUpperCase()}`}
                    pieceSet={pieceSet}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="mt-3 w-full py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              İptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
