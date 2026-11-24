import React from 'react';
import type { PieceSetId } from '../types/chess';

interface ChessPieceProps {
  piece: string; // e.g., 'wK', 'bQ', 'wP'
  pieceSet?: PieceSetId;
  className?: string;
}

export const ChessPieceSvg: React.FC<ChessPieceProps> = ({
  piece,
  pieceSet = 'staunton',
  className = 'w-full h-full',
}) => {
  const isWhite = piece.startsWith('w');
  const type = piece[1]?.toUpperCase() || 'P';

  const palette =
    pieceSet === 'classic'
      ? {
          wFill: '#F5EFE0',
          wStroke: '#292018',
          wDetail: '#8B7355',
          bFill: '#2C221B',
          bStroke: '#120D09',
          bDetail: '#D4B483',
        }
      : pieceSet === 'modern'
        ? {
            wFill: '#F8FAFC',
            wStroke: '#0F172A',
            wDetail: '#64748B',
            bFill: '#1E293B',
            bStroke: '#020617',
            bDetail: '#10B981',
          }
        : {
            wFill: '#F8FAFC',
            wStroke: '#1E293B',
            wDetail: '#94A3B8',
            bFill: '#181C24',
            bStroke: '#090B10',
            bDetail: '#D4AF37',
          };

  const fill = isWhite ? palette.wFill : palette.bFill;
  const stroke = isWhite ? palette.wStroke : palette.bStroke;
  const detail = isWhite ? palette.wDetail : palette.bDetail;
  const strokeW = pieceSet === 'modern' ? 1.8 : 1.5;

  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))' }}
      aria-hidden="true"
    >
      {type === 'P' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
          <path d="M13 36.5h19" stroke={detail} strokeWidth="1.2" fill="none" />
        </g>
      )}

      {type === 'R' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M11 14h23" />
          <path d="M15 20h15M15 25h15" stroke={detail} strokeWidth="1" fill="none" />
        </g>
      )}

      {type === 'N' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          <circle cx="15" cy="15.5" r="0.8" fill={detail} stroke="none" />
          <path d="M9.5 25.5a0.5 0.5 0 1 1-1 0 0.5 0.5 0 1 1 1 0z" fill={detail} stroke="none" />
        </g>
      )}

      {type === 'B' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <g fill={fill} stroke={stroke}>
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke={detail} strokeWidth="1.4" fill="none" />
        </g>
      )}

      {type === 'Q' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="14" cy="9" r="2.2" />
          <circle cx="22.5" cy="8" r="2.2" />
          <circle cx="31" cy="9" r="2.2" />
          <circle cx="39" cy="12" r="2.2" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" stroke={detail} strokeWidth="1.2" fill="none" />
        </g>
      )}

      {type === 'K' && (
        <g fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" stroke={isWhite ? stroke : detail} strokeWidth="1.8" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke={detail} strokeWidth="1.2" fill="none" />
        </g>
      )}
    </svg>
  );
};
