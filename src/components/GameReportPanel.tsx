import React from 'react';
import { ArrowUpRight, CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import type { GameAnalysisReport, MoveClassification } from '../types/chess';
import { EvalGraph } from './EvalGraph';

interface GameReportPanelProps {
  report: GameAnalysisReport;
  whiteName: string;
  blackName: string;
  selectedPly: number;
  onSelectPly: (ply: number) => void;
  onOpenInStudio?: () => void;
}

const CLASS_LABELS: { key: MoveClassification; label: string; color: string }[] = [
  { key: 'brilliant', label: 'Harika Hamle (!!)', color: 'text-cyan-400' },
  { key: 'best', label: 'En İyi Hamle', color: 'text-emerald-400' },
  { key: 'inaccuracy', label: 'Küçük Hata', color: 'text-amber-300' },
  { key: 'mistake', label: 'Hata', color: 'text-orange-400' },
  { key: 'blunder', label: 'Büyük Hata (Gafla)', color: 'text-rose-400' },
];

const CLASS_NAME_TR: Record<MoveClassification, string> = {
  brilliant: 'Harika',
  best: 'En İyi',
  excellent: 'Mükemmel',
  good: 'İyi',
  inaccuracy: 'Küçük Hata',
  mistake: 'Hata',
  blunder: 'Büyük Hata',
};

export const GameReportPanel: React.FC<GameReportPanelProps> = ({
  report,
  whiteName,
  blackName,
  selectedPly,
  onSelectPly,
  onOpenInStudio,
}) => {
  const formatPhase = (val: number | null) => (val === null ? '—' : `%${val.toFixed(1)}`);

  return (
    <div className="space-y-5">
      {/* Doğruluk Özeti */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Beyaz</p>
              <p className="text-sm font-semibold text-white truncate max-w-[160px]">{whiteName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Doğruluk</p>
              <p className="text-2xl font-mono font-bold tabular-nums text-emerald-400">
                %{report.accuracyWhite.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block">Açılış</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyWhite.opening)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Orta Oyun</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyWhite.middlegame)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Oyun Sonu</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyWhite.endgame)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Siyah</p>
              <p className="text-sm font-semibold text-white truncate max-w-[160px]">{blackName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Doğruluk</p>
              <p className="text-2xl font-mono font-bold tabular-nums text-amber-300">
                %{report.accuracyBlack.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block">Açılış</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyBlack.opening)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Orta Oyun</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyBlack.middlegame)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Oyun Sonu</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatPhase(report.phaseAccuracyBlack.endgame)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Değerlendirme Grafiği */}
      <EvalGraph moves={report.moves} selectedPly={selectedPly} onSelectPly={onSelectPly} />

      {/* Hamle Kalitesi Tablosu */}
      <div className="rounded-lg border border-white/[0.08] bg-[#262522] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">
            Hamle Kalitesi · {report.openingName}
          </span>
          {onOpenInStudio && (
            <button
              type="button"
              onClick={onOpenInStudio}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              Stüdyoda Aç
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="divide-y divide-white/[0.05]">
          {CLASS_LABELS.map((row) => (
            <div
              key={row.key}
              className="px-4 py-2 grid grid-cols-3 items-center text-xs"
            >
              <span className="font-mono tabular-nums text-slate-200 font-semibold">
                {report.countsWhite[row.key]}
              </span>
              <span className={`text-center font-medium ${row.color}`}>{row.label}</span>
              <span className="font-mono tabular-nums text-slate-200 font-semibold text-right">
                {report.countsBlack[row.key]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Kaçırılan Fırsatlar */}
      <div className="rounded-lg border border-white/[0.08] bg-[#262522] p-4">
        <h4 className="text-xs font-semibold text-slate-200 mb-3">
          Kritik Anlar ve Kaçırılan Fırsatlar ({report.missedOpportunities.length})
        </h4>
        {report.missedOpportunities.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Temiz oyun — önemli bir taktik hata veya büyük gaf tespit edilmedi.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {report.missedOpportunities.map((m) => (
              <button
                key={m.ply}
                type="button"
                onClick={() => onSelectPly(m.ply)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                  selectedPly === m.ply
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-[#1E1D1A] border-white/[0.06] hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {m.classification === 'blunder' ? (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-100 truncate">
                      {m.moveNumber}
                      {m.color === 'w' ? '.' : '...'} {m.san}{' '}
                      <span className="text-slate-400 font-normal">
                        ({CLASS_NAME_TR[m.classification]})
                      </span>
                    </p>
                    <p className="text-[11px] text-emerald-400 font-mono">
                      En iyisi: {m.bestMoveSan} · -{(m.cpLoss / 100).toFixed(2)} piyon
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  Hamle {m.ply}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
