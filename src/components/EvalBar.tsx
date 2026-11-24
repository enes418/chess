import React from 'react';
import { formatEvalLabel } from '../services/chessLogic';

interface EvalBarProps {
  scoreCp: number | null;
  mate: number | null;
  orientation?: 'w' | 'b';
}

export const EvalBar: React.FC<EvalBarProps> = ({
  scoreCp,
  mate,
  orientation = 'w',
}) => {
  let whitePercent = 50;
  if (mate !== null) {
    whitePercent = mate > 0 ? 100 : 0;
  } else if (scoreCp !== null) {
    const winProb = 50 + 50 * (2 / (1 + Math.exp(-0.004 * scoreCp)) - 1);
    whitePercent = Math.max(4, Math.min(96, winProb));
  }

  const label = formatEvalLabel(scoreCp, mate);
  const whiteWinning = mate !== null ? mate > 0 : (scoreCp ?? 0) >= 0;

  const topHeight = orientation === 'w' ? 100 - whitePercent : whitePercent;
  const topIsBlack = orientation === 'w';

  return (
    <div
      className="relative w-7 sm:w-8 h-full min-h-[240px] rounded-md overflow-hidden border border-white/10 bg-[#1E1D1A] flex flex-col shrink-0 select-none"
      title={`Değerlendirme: ${label}`}
    >
      <div
        className={`w-full transition-all duration-300 ease-out ${
          topIsBlack ? 'bg-[#1A202C]' : 'bg-[#F1F5F9]'
        }`}
        style={{ height: `${topHeight}%` }}
      />
      <div
        className={`w-full flex-1 transition-all duration-300 ease-out ${
          topIsBlack ? 'bg-[#F1F5F9]' : 'bg-[#1A202C]'
        }`}
      />
      <span
        className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold tabular-nums px-0.5 leading-tight ${
          whiteWinning
            ? orientation === 'w'
              ? 'bottom-1.5 text-slate-900'
              : 'top-1.5 text-slate-900'
            : orientation === 'w'
              ? 'top-1.5 text-slate-100'
              : 'bottom-1.5 text-slate-100'
        }`}
      >
        {label}
      </span>
    </div>
  );
};
