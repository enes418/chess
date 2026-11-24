import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import {
  BarChart3,
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
} from 'lucide-react';
import type { BoardThemeId, OpeningEntry, PieceSetId } from '../types/chess';
import { CHESS_OPENINGS } from '../data/openings';
import { ChessBoard } from '../components/ChessBoard';

interface OpeningsViewProps {
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  isAdmin?: boolean;
  onPracticeVsAi: (fen: string) => void;
  onOpenInStudio: (pgn: string, fen: string) => void;
}

export const OpeningsView: React.FC<OpeningsViewProps> = ({
  boardTheme,
  pieceSet,
  isAdmin = false,
  onPracticeVsAi,
  onOpenInStudio,
}) => {
  const [selectedOpening, setSelectedOpening] = useState<OpeningEntry>(CHESS_OPENINGS[0]);
  const [step, setStep] = useState<number>(CHESS_OPENINGS[0].movesSan.length);

  const timeline = useMemo(() => {
    const chess = new Chess();
    const nodes: { fen: string; san: string | null; from: string | null; to: string | null }[] = [
      { fen: chess.fen(), san: null, from: null, to: null },
    ];
    for (const san of selectedOpening.movesSan) {
      const moved = chess.move(san);
      if (!moved) break;
      nodes.push({
        fen: chess.fen(),
        san: moved.san,
        from: moved.from,
        to: moved.to,
      });
    }
    return nodes;
  }, [selectedOpening]);

  const currentNode = timeline[Math.min(step, timeline.length - 1)] || timeline[0];

  const handleSelectOpening = (entry: OpeningEntry) => {
    setSelectedOpening(entry);
    setStep(entry.movesSan.length);
  };

  const buildPgnUpToStep = () => {
    const c = new Chess();
    for (let i = 1; i <= Math.min(step, timeline.length - 1); i++) {
      const s = timeline[i].san;
      if (s) c.move(s);
    }
    return c.pgn();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.08] pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Açılış Kaşifi</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Temel satranç açılış sistemlerini, ECO teorisini ve orta oyun planlarını öğrenin
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#262522] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">Repertuvar Veritabanı</span>
            <BookOpen className="w-4 h-4 text-[#81B64C]" />
          </div>
          <div className="divide-y divide-white/[0.05]">
            {CHESS_OPENINGS.map((op) => {
              const active = op.id === selectedOpening.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleSelectOpening(op)}
                  className={`w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                    active ? 'bg-[#81B64C]/20' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{op.name}</span>
                    <span className="text-xs font-mono text-amber-400">{op.eco}</span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                    {op.movesSan
                      .map((m, idx) => (idx % 2 === 0 ? `${idx / 2 + 1}.${m}` : m))
                      .join(' ')}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-3 max-w-[440px] w-full mx-auto">
          <ChessBoard
            fen={currentNode.fen}
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            interactive={false}
            lastMove={
              currentNode.from && currentNode.to
                ? { from: currentNode.from, to: currentNode.to }
                : null
            }
            onMove={() => false}
          />

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#262522] border border-white/[0.08]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStep(0)}
                disabled={step === 0}
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(timeline.length - 1, s + 1))}
                disabled={step >= timeline.length - 1}
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setStep(timeline.length - 1)}
                disabled={step >= timeline.length - 1}
                className="p-2 rounded-lg hover:bg-white/[0.06] disabled:opacity-35 text-slate-200 cursor-pointer"
              >
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Hamle {step}/{timeline.length - 1}
            </span>
          </div>
        </div>

        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
          <div>
            <p className="text-xs font-mono text-amber-400">
              ECO {selectedOpening.eco} · {selectedOpening.popularity}
            </p>
            <h2 className="text-lg font-bold text-white mt-0.5">{selectedOpening.name}</h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {selectedOpening.description}
          </p>

          <div className="p-3 rounded-lg bg-[#1E1D1A] border border-white/[0.06] flex flex-wrap gap-1.5 font-mono text-xs">
            {selectedOpening.movesSan.map((san, idx) => {
              const ply = idx + 1;
              const prefix = idx % 2 === 0 ? `${idx / 2 + 1}.` : '';
              return (
                <button
                  key={`${san}-${ply}`}
                  type="button"
                  onClick={() => setStep(ply)}
                  className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                    step === ply
                      ? 'bg-[#81B64C] text-white font-semibold'
                      : 'text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {prefix}
                  {san}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <h3 className="font-semibold text-white mb-1">Beyaz’ın Stratejik Planı</h3>
              <p className="text-slate-300 leading-relaxed">{selectedOpening.whitePlan}</p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Siyah’ın Karşı Oyunu</h3>
              <p className="text-slate-300 leading-relaxed">{selectedOpening.blackPlan}</p>
            </div>
            <p className="text-slate-400 pt-1">
              Temalar: <span className="text-slate-200">{selectedOpening.keyThemes.join(' · ')}</span>
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onPracticeVsAi(currentNode.fen)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              Bilgisayara Karşı Çalış
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onOpenInStudio(buildPgnUpToStep(), currentNode.fen)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                Stüdyoda Aç
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
