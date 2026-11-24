import React from 'react';
import type { AnalyzedMove } from '../types/chess';

interface EvalGraphProps {
  moves: AnalyzedMove[];
  selectedPly: number;
  onSelectPly: (ply: number) => void;
}

export const EvalGraph: React.FC<EvalGraphProps> = ({
  moves,
  selectedPly,
  onSelectPly,
}) => {
  if (moves.length === 0) {
    return (
      <div className="h-32 rounded-lg border border-white/[0.08] bg-[#1E1D1A] flex items-center justify-center text-xs text-slate-400">
        Hamle bazlı değerlendirme grafiği için tam oyun analizini çalıştırın.
      </div>
    );
  }

  const width = 600;
  const height = 140;
  const midY = height / 2;

  const cpToY = (cp: number) => {
    const clamped = Math.max(-800, Math.min(800, cp));
    return midY - (clamped / 800) * (height / 2 - 12);
  };

  const points = [
    { ply: 0, x: 0, y: cpToY(moves[0]?.evalBeforeCp ?? 0), move: null as AnalyzedMove | null },
    ...moves.map((m, idx) => ({
      ply: m.ply,
      x: ((idx + 1) / moves.length) * width,
      y: cpToY(m.evalAfterCp),
      move: m,
    })),
  ];

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const selectedPoint = points.find((p) => p.ply === selectedPly) || points[points.length - 1];

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#1E1D1A] p-3">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span>Değerlendirme Grafiği</span>
        <span className="font-mono tabular-nums text-slate-300">
          Hamle {selectedPly}/{moves.length}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-28 overflow-visible cursor-pointer"
      >
        <defs>
          <linearGradient id="evalAreaWhite" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(241, 245, 249, 0.35)" />
            <stop offset="50%" stopColor="rgba(241, 245, 249, 0.08)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.0)" />
          </linearGradient>
        </defs>

        <line
          x1={0}
          y1={midY}
          x2={width}
          y2={midY}
          stroke="rgba(148, 163, 184, 0.25)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        <path d={areaPath} fill="url(#evalAreaWhite)" />
        <path d={linePath} fill="none" stroke="#81B64C" strokeWidth={2} strokeLinejoin="round" />

        {selectedPoint && (
          <line
            x1={selectedPoint.x}
            y1={0}
            x2={selectedPoint.x}
            y2={height}
            stroke="rgba(245, 158, 11, 0.65)"
            strokeWidth={1.5}
          />
        )}

        {points.map((pt) => {
          const cls = pt.move?.classification;
          const isNotable =
            cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy' || cls === 'brilliant';
          const dotColor =
            cls === 'blunder'
              ? '#EF4444'
              : cls === 'mistake'
                ? '#F97316'
                : cls === 'inaccuracy'
                  ? '#FACC15'
                  : cls === 'brilliant'
                    ? '#22D3EE'
                    : '#81B64C';

          return (
            <g key={pt.ply} onClick={() => onSelectPly(pt.ply)}>
              <rect
                x={Math.max(0, pt.x - width / Math.max(10, points.length * 2))}
                y={0}
                width={Math.max(8, width / Math.max(1, points.length))}
                height={height}
                fill="transparent"
              />
              {(isNotable || pt.ply === selectedPly) && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={pt.ply === selectedPly ? 4.5 : 3.2}
                  fill={dotColor}
                  stroke="#0B0F17"
                  strokeWidth={1.2}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
