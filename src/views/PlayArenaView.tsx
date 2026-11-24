import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Cpu,
  Flag,
  FlipVertical2,
  Loader2,
  LogIn,
  Play,
  Power,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  Undo2,
  Users,
  Zap,
} from 'lucide-react';
import type {
  BoardThemeId,
  DifficultyLevel,
  GameAnalysisReport,
  GameRecord,
  MultiplayerRoom,
  PieceSetId,
  PlayerProfile,
  PlaySubMode,
  PositionEvaluation,
} from '../types/chess';
import {
  calculateEloDelta,
  detectOpeningName,
  DIFFICULTY_CONFIG,
  formatClock,
  formatEvalLabel,
  getMaterialSummary,
  INITIAL_FEN,
  validateFen,
} from '../services/chessLogic';
import { chessEngine } from '../services/chessEngine';
import {
  createMultiplayerRoom,
  finishRoomEarly,
  joinMultiplayerRoom,
  submitRoomMove,
  subscribeRoom,
} from '../services/firebase';
import {
  createSiteRoom,
  finishSiteRoom,
  joinSiteRoom,
  submitSiteRoomMove,
  subscribeSiteRoom,
} from '../services/localAuthApi';
import { soundFX } from '../utils/sound';
import { ChessBoard, type BoardArrow } from '../components/ChessBoard';
import { ChessPieceSvg } from '../components/ChessPieces';
import { EvalBar } from '../components/EvalBar';
import { GameReportPanel } from '../components/GameReportPanel';

interface PlayArenaViewProps {
  subMode: PlaySubMode;
  onChangeSubMode: (mode: PlaySubMode) => void;
  initialFen?: string;
  onConsumeInitialFen?: () => void;
  initialRoomCode?: string | null;
  onJoinedInitialRoom?: () => void;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  profile: PlayerProfile | null;
  isSignedIn: boolean;
  isAdmin?: boolean;
  cheatEngineAllowed?: boolean;
  onToggleCheatEngineAllowed?: (enabled: boolean) => Promise<void>;
  siteToken?: string | null;
  onSignIn: () => void;
  onGameCompleted: (
    record: Omit<GameRecord, 'id' | 'createdAtMs'>,
    eloDelta: number,
    outcome: 'win' | 'loss' | 'draw',
    openingName: string,
  ) => Promise<void>;
  onOpenInStudio: (pgn: string, fen: string) => void;
}

const TIME_CONTROLS = [
  { label: '3 + 2', sec: 180, inc: 2 },
  { label: '5 + 0', sec: 300, inc: 0 },
  { label: '10 + 0', sec: 600, inc: 0 },
  { label: '15 + 10', sec: 900, inc: 10 },
  { label: 'Sınırsız', sec: 0, inc: 0 },
];

export const PlayArenaView: React.FC<PlayArenaViewProps> = ({
  subMode,
  onChangeSubMode,
  initialFen,
  onConsumeInitialFen,
  initialRoomCode,
  onJoinedInitialRoom,
  boardTheme,
  pieceSet,
  profile,
  isSignedIn,
  isAdmin = false,
  cheatEngineAllowed = true,
  onToggleCheatEngineAllowed,
  siteToken,
  onSignIn,
  onGameCompleted,
  onOpenInStudio,
}) => {
  // Oyun Yapılandırması
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [thinkingTimeMs, setThinkingTimeMs] = useState<number>(600);
  const [preferredColor, setPreferredColor] = useState<'w' | 'b' | 'random'>('w');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [customFenInput, setCustomFenInput] = useState<string>(initialFen || INITIAL_FEN);
  const [startFen, setStartFen] = useState<string>(initialFen || INITIAL_FEN);
  const [timeControlIdx, setTimeControlIdx] = useState<number>(2); // Varsayılan 10+0
  const [autoFlipLocal, setAutoFlipLocal] = useState<boolean>(false);

  // Aktif Maç Giriş Durumu (Maça girilmeden tahta gösterilmez)
  const [inMatch, setInMatch] = useState<boolean>(Boolean(initialFen || initialRoomCode));

  // Aktif Oyun Durumu
  const [fen, setFen] = useState<string>(initialFen || INITIAL_FEN);
  const [pgn, setPgn] = useState<string>('');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [gameStatus, setGameStatus] = useState<'idle' | 'playing' | 'finished'>('playing');
  const [gameResult, setGameResult] = useState<{
    result: '1-0' | '0-1' | '1/2-1/2';
    termination: string;
    winner: 'w' | 'b' | 'draw';
  } | null>(null);

  // Saatler (ms cinsinden)
  const [whiteTimeMs, setWhiteTimeMs] = useState<number>(600000);
  const [blackTimeMs, setBlackTimeMs] = useState<number>(600000);

  // Serbest Tahta İpucu (Sadece Admin)
  const [hintArrow, setHintArrow] = useState<BoardArrow[]>([]);
  const [hintText, setHintText] = useState<string | null>(null);

  // Admin Özel Canlı Pro Satranç Hile Motoru
  const [cheatEngineOn, setCheatEngineOn] = useState<boolean>(false);
  const [cheatDepth, setCheatDepth] = useState<number>(10);
  const [cheatEval, setCheatEval] = useState<PositionEvaluation | null>(null);
  const [isCheatEvaluating, setIsCheatEvaluating] = useState<boolean>(false);
  const [togglingMasterCheat, setTogglingMasterCheat] = useState<boolean>(false);

  // Oyun Sonu Raporu (Sadece Admin)
  const [report, setReport] = useState<GameAnalysisReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportProgress, setReportProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [reportSelectedPly, setReportSelectedPly] = useState<number>(0);

  // Çevrimiçi Oda Durumu
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<MultiplayerRoom | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isRoomBusy, setIsRoomBusy] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const chessRef = useRef<Chess>(new Chess(initialFen || INITIAL_FEN));
  const savedCompletionRef = useRef<boolean>(false);
  const aiTriggerLockRef = useRef<boolean>(false);

  // VS Davetinden gelen oda kodunu otomatik aç
  useEffect(() => {
    if (initialRoomCode && subMode === 'online') {
      setActiveRoomCode(initialRoomCode);
      setInMatch(true);
      setRoomError(null);
      onJoinedInitialRoom?.();
    }
  }, [initialRoomCode, onJoinedInitialRoom, subMode]);

  // Açılış veya Stüdyo'dan gelen FEN senkronizasyonu
  useEffect(() => {
    if (initialFen) {
      const check = validateFen(initialFen);
      if (check.valid) {
        setCustomFenInput(initialFen);
        setStartFen(initialFen);
        chessRef.current = new Chess(initialFen);
        setFen(initialFen);
        setPgn('');
        setMoveHistory([]);
        setLastMove(null);
        setGameStatus('playing');
        setGameResult(null);
        setReport(null);
        setHintArrow([]);
        setHintText(null);
        setInMatch(true);
      }
      onConsumeInitialFen?.();
    }
  }, [initialFen, onConsumeInitialFen]);

  // Yerel / AI oyunu sıfırla
  const startNewLocalOrAiGame = useCallback(
    (overrideFen?: string) => {
      chessEngine.stopSearch();
      const targetFen = (overrideFen ?? customFenInput).trim() || INITIAL_FEN;
      const check = validateFen(targetFen);
      const validFen = check.valid ? targetFen : INITIAL_FEN;
      if (!check.valid) {
        setRoomError(check.error || 'Geçersiz FEN konumu, başlangıç dizilimine dönüldü.');
      } else {
        setRoomError(null);
      }

      const chosenColor: 'w' | 'b' =
        subMode === 'ai'
          ? preferredColor === 'random'
            ? Math.random() < 0.5
              ? 'w'
              : 'b'
            : preferredColor
          : 'w';

      const tc = TIME_CONTROLS[timeControlIdx];
      const initialMs = tc.sec > 0 ? tc.sec * 1000 : 0;

      chessRef.current = new Chess(validFen);
      savedCompletionRef.current = false;
      aiTriggerLockRef.current = false;

      setStartFen(validFen);
      setFen(validFen);
      setPgn('');
      setMoveHistory([]);
      setLastMove(null);
      setPlayerColor(chosenColor);
      setOrientation(chosenColor);
      setWhiteTimeMs(initialMs);
      setBlackTimeMs(initialMs);
      setGameStatus('playing');
      setGameResult(null);
      setReport(null);
      setHintArrow([]);
      setHintText(null);
      setIsAiThinking(false);
    },
    [customFenInput, preferredColor, subMode, timeControlIdx],
  );

  const isInActiveMatch = subMode === 'online' ? Boolean(activeRoomCode) : inMatch;

  const handleSelectSubMode = (nextMode: PlaySubMode) => {
    chessEngine.stopSearch();
    setInMatch(false);
    onChangeSubMode(nextMode);
  };

  // Alt mod değişiminde tahtayı sıfırla ve çevrimiçi modda sınırsız süreyi düzelt
  useEffect(() => {
    if (subMode !== 'online') {
      setActiveRoomCode(null);
      setRoomData(null);
      startNewLocalOrAiGame(startFen);
    } else if (TIME_CONTROLS[timeControlIdx]?.sec === 0) {
      setTimeControlIdx(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subMode]);

  // Tamamlanan maçı kaydet
  const handleGameOver = useCallback(
    async (
      result: '1-0' | '0-1' | '1/2-1/2',
      termination: string,
      winner: 'w' | 'b' | 'draw',
      finalChess: Chess,
      context?: { room?: MultiplayerRoom; myColor?: 'w' | 'b' },
    ) => {
      setGameStatus('finished');
      setGameResult({ result, termination, winner });
      soundFX.play('gameOver');

      if (savedCompletionRef.current || subMode === 'practice') return;
      savedCompletionRef.current = true;

      const activeRoom = context?.room ?? roomData;
      const resolvedPlayerColor = context?.myColor ?? playerColor;
      const history = finalChess.history();
      const openingName = detectOpeningName(history);
      const userCol = subMode === 'local' ? 'w' : resolvedPlayerColor;
      const playerScore: 1 | 0.5 | 0 =
        winner === 'draw' ? 0.5 : winner === userCol ? 1 : 0;

      const myElo = profile?.elo ?? 1200;
      const oppElo =
        subMode === 'ai'
          ? DIFFICULTY_CONFIG[difficulty].elo
          : subMode === 'online' && activeRoom
            ? userCol === 'w'
              ? activeRoom.whiteId === activeRoom.hostId
                ? activeRoom.guestElo ?? 1200
                : activeRoom.hostElo
              : activeRoom.blackId === activeRoom.hostId
                ? activeRoom.guestElo ?? 1200
                : activeRoom.hostElo
            : myElo;

      const eloDelta = subMode === 'local' ? 0 : calculateEloDelta(myElo, oppElo, playerScore);
      const outcome: 'win' | 'loss' | 'draw' =
        playerScore === 1 ? 'win' : playerScore === 0.5 ? 'draw' : 'loss';

      const whiteName =
        subMode === 'ai'
          ? userCol === 'w'
            ? profile?.username || 'Sen'
            : `Pro Bot (${DIFFICULTY_CONFIG[difficulty].label})`
          : subMode === 'online' && activeRoom
            ? activeRoom.whiteId === activeRoom.hostId
              ? activeRoom.hostName
              : activeRoom.guestName || 'Rakip'
            : 'Beyaz Oyuncu';

      const blackName =
        subMode === 'ai'
          ? userCol === 'b'
            ? profile?.username || 'Sen'
            : `Pro Bot (${DIFFICULTY_CONFIG[difficulty].label})`
          : subMode === 'online' && activeRoom
            ? activeRoom.blackId === activeRoom.hostId
              ? activeRoom.hostName
              : activeRoom.guestName || 'Rakip'
            : 'Siyah Oyuncu';

      await onGameCompleted(
        {
          ownerId: profile?.uid || 'local-guest',
          participantIds: [profile?.uid || 'local-guest'],
          mode: subMode,
          whiteName,
          blackName,
          whiteElo: userCol === 'w' ? myElo : oppElo,
          blackElo: userCol === 'b' ? myElo : oppElo,
          playerColor: userCol,
          result,
          termination,
          openingName,
          pgn: finalChess.pgn(),
          finalFen: finalChess.fen(),
          moveCount: Math.ceil(history.length / 2),
          eloDelta,
        },
        eloDelta,
        outcome,
        openingName,
      );
    },
    [difficulty, onGameCompleted, playerColor, profile, roomData, subMode],
  );

  // Çevrimiçi Oda Gerçek Zamanlı Abonelik (Site içi SSE veya Firestore)
  useEffect(() => {
    if (subMode !== 'online' || !activeRoomCode) return;
    setReport(null);
    setHintArrow([]);
    setHintText(null);

    const handleRoomUpdate = (room: MultiplayerRoom | null) => {
      setRoomData(room);
      if (!room) return;
      setRoomError(null);

      const c = new Chess();
      try {
        if (room.pgn) {
          c.loadPgn(room.pgn);
        } else {
          c.load(room.fen);
        }
      } catch {
        c.load(room.fen);
      }
      chessRef.current = c;
      setFen(room.fen);
      setPgn(room.pgn);
      setMoveHistory(c.history());
      setLastMove(
        room.lastMoveFrom && room.lastMoveTo
          ? { from: room.lastMoveFrom, to: room.lastMoveTo }
          : null,
      );
      setWhiteTimeMs(room.whiteTimeMs);
      setBlackTimeMs(room.blackTimeMs);

      let resolvedMyCol: 'w' | 'b' = playerColor;
      if (profile) {
        resolvedMyCol = room.whiteId === profile.uid ? 'w' : 'b';
        setPlayerColor(resolvedMyCol);
        setOrientation(resolvedMyCol);
      }

      if (room.status === 'finished' && room.winner) {
        const resStr =
          room.winner === 'w' ? '1-0' : room.winner === 'b' ? '0-1' : '1/2-1/2';
        if (!savedCompletionRef.current) {
          void handleGameOver(
            resStr,
            room.termination || 'Oyun Bitti',
            room.winner,
            c,
            { room, myColor: resolvedMyCol },
          );
        } else {
          setGameStatus('finished');
          setGameResult({
            result: resStr,
            termination: room.termination || 'Oyun Bitti',
            winner: room.winner,
          });
        }
      } else if (room.status === 'active') {
        savedCompletionRef.current = false;
        setGameStatus('playing');
        setGameResult(null);
      } else if (room.status === 'waiting') {
        savedCompletionRef.current = false;
        setGameStatus('playing');
        setGameResult(null);
      }
    };

    const unsub = siteToken
      ? subscribeSiteRoom(siteToken, activeRoomCode, handleRoomUpdate, (err) => setRoomError(err))
      : subscribeRoom(activeRoomCode, handleRoomUpdate);

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subMode, activeRoomCode, profile, siteToken]);

  // Aktif Saat Sayacı
  useEffect(() => {
    if (!isInActiveMatch || gameStatus !== 'playing') return;
    if (subMode === 'practice') return;

    if (subMode === 'online') {
      if (!roomData || roomData.status !== 'active') return;
      const interval = setInterval(() => {
        const elapsed = Date.now() - roomData.lastMoveAtMs;
        if (roomData.turn === 'w') {
          const rem = Math.max(0, roomData.whiteTimeMs - elapsed);
          setWhiteTimeMs(rem);
          setBlackTimeMs(roomData.blackTimeMs);
          if (rem === 0 && profile?.uid === roomData.whiteId) {
            if (siteToken) {
              void finishSiteRoom(siteToken, roomData.roomCode, 'b', 'Süre Doldu');
            } else {
              void finishRoomEarly(roomData.roomCode, roomData, 'b', 'Süre Doldu');
            }
          }
        } else {
          const rem = Math.max(0, roomData.blackTimeMs - elapsed);
          setBlackTimeMs(rem);
          setWhiteTimeMs(roomData.whiteTimeMs);
          if (rem === 0 && profile?.uid === roomData.blackId) {
            if (siteToken) {
              void finishSiteRoom(siteToken, roomData.roomCode, 'w', 'Süre Doldu');
            } else {
              void finishRoomEarly(roomData.roomCode, roomData, 'w', 'Süre Doldu');
            }
          }
        }
      }, 200);
      return () => clearInterval(interval);
    }

    const tc = TIME_CONTROLS[timeControlIdx];
    if (tc.sec === 0 || moveHistory.length === 0) return;

    const interval = setInterval(() => {
      const turn = chessRef.current.turn();
      if (turn === 'w') {
        setWhiteTimeMs((prev) => {
          const next = Math.max(0, prev - 200);
          if (next === 0) {
            void handleGameOver('0-1', 'Beyazın Süresi Doldu', 'b', chessRef.current);
          }
          return next;
        });
      } else {
        setBlackTimeMs((prev) => {
          const next = Math.max(0, prev - 200);
          if (next === 0) {
            void handleGameOver('1-0', 'Siyahın Süresi Doldu', 'w', chessRef.current);
          }
          return next;
        });
      }
    }, 200);

    return () => clearInterval(interval);
  }, [gameStatus, handleGameOver, isInActiveMatch, moveHistory.length, profile, roomData, siteToken, subMode, timeControlIdx]);

  // Hamle uygula
  const applyMoveToBoard = useCallback(
    (moveInput: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean => {
      if (gameStatus !== 'playing') return false;
      const chess = chessRef.current;

      try {
        const moved = chess.move(moveInput);
        if (!moved) return false;

        const nextFen = chess.fen();
        const nextPgn = chess.pgn();
        const history = chess.history();

        setFen(nextFen);
        setPgn(nextPgn);
        setMoveHistory(history);
        setLastMove({ from: moved.from, to: moved.to });
        setHintArrow([]);
        setHintText(null);

        if (chess.isCheckmate()) {
          const winner: 'w' | 'b' = moved.color;
          const result = winner === 'w' ? '1-0' : '0-1';
          soundFX.play('check');
          if (subMode === 'online' && roomData) {
            if (siteToken) {
              void submitSiteRoomMove(siteToken, roomData.roomCode, moveInput).catch((err) =>
                setRoomError(err instanceof Error ? err.message : 'Hamle sunucuya gönderilemedi.'),
              );
            } else {
              void submitRoomMove(roomData.roomCode, {
                fen: nextFen,
                pgn: nextPgn,
                turn: chess.turn(),
                lastMoveFrom: moved.from,
                lastMoveTo: moved.to,
                whiteTimeMs,
                blackTimeMs,
                lastMoveAtMs: Date.now(),
                status: 'finished',
                winner,
                termination: 'Şah Mat',
              });
            }
          }
          void handleGameOver(result, 'Şah Mat', winner, chess, {
            room: roomData ?? undefined,
            myColor: playerColor,
          });
          return true;
        }

        if (
          chess.isDraw() ||
          chess.isStalemate() ||
          chess.isThreefoldRepetition() ||
          chess.isInsufficientMaterial()
        ) {
          const reason = chess.isStalemate()
            ? 'Pat'
            : chess.isThreefoldRepetition()
              ? 'Üç Kez Konum Tekrarı'
              : chess.isInsufficientMaterial()
                ? 'Yetersiz Materyal'
                : '50 Hamle Kuralı Beraberliği';
          soundFX.play('move');
          if (subMode === 'online' && roomData) {
            if (siteToken) {
              void submitSiteRoomMove(siteToken, roomData.roomCode, moveInput).catch((err) =>
                setRoomError(err instanceof Error ? err.message : 'Hamle sunucuya gönderilemedi.'),
              );
            } else {
              void submitRoomMove(roomData.roomCode, {
                fen: nextFen,
                pgn: nextPgn,
                turn: chess.turn(),
                lastMoveFrom: moved.from,
                lastMoveTo: moved.to,
                whiteTimeMs,
                blackTimeMs,
                lastMoveAtMs: Date.now(),
                status: 'finished',
                winner: 'draw',
                termination: reason,
              });
            }
          }
          void handleGameOver('1/2-1/2', reason, 'draw', chess, {
            room: roomData ?? undefined,
            myColor: playerColor,
          });
          return true;
        }

        if (chess.inCheck()) {
          soundFX.play('check');
        } else if (moved.san.includes('O-O')) {
          soundFX.play('castle');
        } else if (moved.captured) {
          soundFX.play('capture');
        } else {
          soundFX.play('move');
        }

        if (subMode !== 'online' && subMode !== 'practice') {
          const incMs = TIME_CONTROLS[timeControlIdx].inc * 1000;
          if (incMs > 0) {
            if (moved.color === 'w') setWhiteTimeMs((t) => t + incMs);
            else setBlackTimeMs((t) => t + incMs);
          }
        }

        if (subMode === 'local' && autoFlipLocal) {
          setOrientation(chess.turn());
        }

        if (subMode === 'online' && roomData) {
          if (siteToken) {
            void submitSiteRoomMove(siteToken, roomData.roomCode, moveInput).catch((err) =>
              setRoomError(err instanceof Error ? err.message : 'Hamle sunucuya gönderilemedi.'),
            );
          } else {
            const nowMs = Date.now();
            const elapsed = Math.max(0, nowMs - roomData.lastMoveAtMs);
            const incMs = roomData.incrementSec * 1000;
            const nextWhiteMs =
              moved.color === 'w'
                ? Math.max(0, roomData.whiteTimeMs - elapsed) + incMs
                : roomData.whiteTimeMs;
            const nextBlackMs =
              moved.color === 'b'
                ? Math.max(0, roomData.blackTimeMs - elapsed) + incMs
                : roomData.blackTimeMs;

            void submitRoomMove(roomData.roomCode, {
              fen: nextFen,
              pgn: nextPgn,
              turn: chess.turn(),
              lastMoveFrom: moved.from,
              lastMoveTo: moved.to,
              whiteTimeMs: nextWhiteMs,
              blackTimeMs: nextBlackMs,
              lastMoveAtMs: nowMs,
              status: 'active',
              winner: null,
              termination: null,
            });
          }
        }

        return true;
      } catch {
        return false;
      }
    },
    [
      autoFlipLocal,
      blackTimeMs,
      gameStatus,
      handleGameOver,
      playerColor,
      roomData,
      siteToken,
      subMode,
      timeControlIdx,
      whiteTimeMs,
    ],
  );

  // Yapay zekâ sırası geldiğinde otomatik hamle yap
  useEffect(() => {
    if (!isInActiveMatch || subMode !== 'ai' || gameStatus !== 'playing') return;
    const chess = chessRef.current;
    if (chess.isGameOver()) return;
    if (chess.turn() === playerColor) return;
    if (aiTriggerLockRef.current) return;

    aiTriggerLockRef.current = true;
    setIsAiThinking(true);
    const activeFen = chess.fen();

    const timer = setTimeout(async () => {
      try {
        const { uci } = await chessEngine.getAiMove(activeFen, difficulty, thinkingTimeMs);
        if (uci && chessRef.current.fen() === activeFen && gameStatus === 'playing') {
          const from = uci.slice(0, 2) as Square;
          const to = uci.slice(2, 4) as Square;
          const promotion = uci[4] as 'q' | 'r' | 'b' | 'n' | undefined;
          applyMoveToBoard({ from, to, promotion });
        }
      } catch (err) {
        console.error('Pro AI motor hatası:', err);
      } finally {
        aiTriggerLockRef.current = false;
        setIsAiThinking(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      aiTriggerLockRef.current = false;
    };
  }, [applyMoveToBoard, difficulty, fen, gameStatus, isInActiveMatch, playerColor, subMode, thinkingTimeMs]);

  // Admin yetkisi veya genel hile motoru kapatılırsa temizle
  useEffect(() => {
    if (!isAdmin || !cheatEngineAllowed) {
      setCheatEngineOn(false);
      setCheatEval(null);
      setIsCheatEvaluating(false);
    }
  }, [cheatEngineAllowed, isAdmin]);

  const effectiveCheatActive = isInActiveMatch && isAdmin && cheatEngineAllowed && cheatEngineOn;

  // Admin Özel Canlı Pro Hile Motoru Değerlendirmesi (Tek Ok, Derin Arama)
  useEffect(() => {
    if (!effectiveCheatActive || gameStatus !== 'playing') {
      setIsCheatEvaluating(false);
      if (subMode !== 'ai') {
        chessEngine.stopSearch();
      }
      return;
    }
    if (subMode === 'ai' && (isAiThinking || chessRef.current.turn() !== playerColor)) {
      return;
    }

    let cancelled = false;
    setIsCheatEvaluating(true);

    const budgetMs = cheatDepth >= 13 ? 2100 : cheatDepth >= 10 ? 1400 : 850;
    const timer = setTimeout(() => {
      chessEngine
        .evaluatePosition(
          fen,
          { depth: cheatDepth, movetimeMs: budgetMs, multiPv: 1, skillLevel: 20 },
          (liveEval) => {
            if (!cancelled) setCheatEval(liveEval);
          },
        )
        .then((finalEval) => {
          if (!cancelled) {
            setCheatEval(finalEval);
            setIsCheatEvaluating(false);
          }
        })
        .catch(() => {
          if (!cancelled) setIsCheatEvaluating(false);
        });
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cheatDepth, effectiveCheatActive, fen, gameStatus, isAiThinking, playerColor, subMode]);

  const handleToggleMasterCheat = async () => {
    if (!isAdmin || !onToggleCheatEngineAllowed) return;
    setTogglingMasterCheat(true);
    try {
      await onToggleCheatEngineAllowed(!cheatEngineAllowed);
    } finally {
      setTogglingMasterCheat(false);
    }
  };

  const canUndoMove =
    subMode !== 'online' &&
    gameStatus === 'playing' &&
    !isAiThinking &&
    moveHistory.length > 0 &&
    !(
      subMode === 'ai' &&
      moveHistory.length === 1 &&
      new Chess(startFen).turn() !== playerColor
    );

  const handleUndo = () => {
    if (!canUndoMove) return;
    const chess = chessRef.current;
    if (chess.history().length === 0) return;

    if (subMode === 'ai') {
      chess.undo();
      if (chess.turn() !== playerColor) {
        chess.undo();
      }
    } else {
      chess.undo();
    }

    const hist = chess.history({ verbose: true });
    const prev = hist[hist.length - 1];
    setFen(chess.fen());
    setPgn(chess.pgn());
    setMoveHistory(hist.map((m) => m.san));
    setLastMove(prev ? { from: prev.from, to: prev.to } : null);
    setHintArrow([]);
    setHintText(null);
  };

  const handleResign = () => {
    if (gameStatus !== 'playing') return;
    if (subMode === 'online' && roomData) {
      const winner: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
      if (siteToken) {
        void finishSiteRoom(siteToken, roomData.roomCode, winner, 'Oyuncu Terk Etti');
      } else {
        void finishRoomEarly(roomData.roomCode, roomData, winner, 'Oyuncu Terk Etti');
      }
      return;
    }
    const winner: 'w' | 'b' =
      subMode === 'local'
        ? chessRef.current.turn() === 'w'
          ? 'b'
          : 'w'
        : playerColor === 'w'
          ? 'b'
          : 'w';
    const result = winner === 'w' ? '1-0' : '0-1';
    void handleGameOver(result, 'Oyuncu Terk Etti', winner, chessRef.current);
  };

  const handleCoachHint = async () => {
    if (subMode !== 'practice' || !isAdmin || !cheatEngineAllowed) return;
    const currentFen = chessRef.current.fen();
    const res = await chessEngine.evaluatePosition(currentFen, {
      depth: 10,
      movetimeMs: 900,
      multiPv: 1,
      skillLevel: 20,
    });
    if (res.bestMoveUci) {
      setHintArrow([
        {
          from: res.bestMoveUci.slice(0, 2),
          to: res.bestMoveUci.slice(2, 4),
          color: 'rgba(16, 185, 129, 0.94)',
        },
      ]);
      setHintText(
        `Önerilen hamle: ${res.bestMoveSan || res.bestMoveUci}${res.insight ? ` — ${res.insight}` : ''}`,
      );
    }
  };

  const handleRunPostGameAnalysis = async () => {
    if (!pgn || isGeneratingReport || !isAdmin) return;
    setIsGeneratingReport(true);
    setReportProgress({ done: 0, total: moveHistory.length + 1 });
    try {
      const fullReport = await chessEngine.analyzeFullGame(
        pgn,
        (done, total) => setReportProgress({ done, total }),
        startFen,
      );
      setReport(fullReport);
      setReportSelectedPly(fullReport.moves.length);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!profile) return;
    setIsRoomBusy(true);
    setRoomError(null);
    try {
      const col: 'w' | 'b' =
        preferredColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : preferredColor;
      const tc =
        TIME_CONTROLS[timeControlIdx].sec > 0 ? TIME_CONTROLS[timeControlIdx] : { sec: 600, inc: 0 };
      if (siteToken) {
        const created = await createSiteRoom(siteToken, col, tc.sec, tc.inc);
        setActiveRoomCode(created.roomCode);
      } else {
        const code = await createMultiplayerRoom(profile, col, tc.sec, tc.inc);
        setActiveRoomCode(code);
      }
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Oda oluşturulamadı.');
    } finally {
      setIsRoomBusy(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsRoomBusy(true);
    setRoomError(null);
    try {
      const joined = siteToken
        ? await joinSiteRoom(siteToken, joinCodeInput)
        : await joinMultiplayerRoom(joinCodeInput, profile);
      setActiveRoomCode(joined.roomCode);
      setJoinCodeInput('');
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Odaya katılınamadı.');
    } finally {
      setIsRoomBusy(false);
    }
  };

  const copyRoomCode = () => {
    if (!activeRoomCode) return;
    navigator.clipboard.writeText(activeRoomCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const material = useMemo(() => getMaterialSummary(fen), [fen]);
  const openingName = useMemo(() => detectOpeningName(moveHistory), [moveHistory]);

  const allowedBoardColor: 'w' | 'b' | 'both' | 'none' =
    gameStatus !== 'playing'
      ? 'none'
      : subMode === 'ai'
        ? isAiThinking
          ? 'none'
          : playerColor
        : subMode === 'online'
          ? roomData?.status === 'active'
            ? playerColor
            : 'none'
          : 'both';

  const movePairs = useMemo(() => {
    const pairs: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: moveHistory[i],
        black: moveHistory[i + 1],
      });
    }
    return pairs;
  }, [moveHistory]);

  const topColor: 'w' | 'b' = orientation === 'w' ? 'b' : 'w';
  const bottomColor: 'w' | 'b' = orientation;

  const getSeatInfo = (col: 'w' | 'b') => {
    if (subMode === 'ai') {
      const isHuman = col === playerColor;
      return {
        name: isHuman ? profile?.username || 'Sen' : `Pro Bot · ${DIFFICULTY_CONFIG[difficulty].label}`,
        elo: isHuman ? profile?.elo ?? 1200 : DIFFICULTY_CONFIG[difficulty].elo,
        avatar: isHuman
          ? profile?.avatarUrl || '/src/assets/images/avatar_ai_tactician_1795539266510.jpg'
          : '/src/assets/images/avatar_ai_master_1795539266931.jpg',
        timeMs: col === 'w' ? whiteTimeMs : blackTimeMs,
        captured: col === 'w' ? material.capturedByWhite : material.capturedByBlack,
        adv: col === 'w' ? material.whiteAdvantage : -material.whiteAdvantage,
      };
    }
    if (subMode === 'online' && roomData) {
      const isHostWhite = roomData.whiteId === roomData.hostId;
      const isColHost = (col === 'w' && isHostWhite) || (col === 'b' && !isHostWhite);
      const seatUid = col === 'w' ? roomData.whiteId : roomData.blackId;
      const isMe = Boolean(profile?.uid && seatUid === profile.uid);
      return {
        name: isColHost ? roomData.hostName : roomData.guestName || 'Rakip bekleniyor...',
        elo: isColHost ? roomData.hostElo : roomData.guestElo ?? 1200,
        avatar: isMe && profile?.avatarUrl
          ? profile.avatarUrl
          : isColHost
            ? '/src/assets/images/avatar_ai_tactician_1795539266510.jpg'
            : '/src/assets/images/avatar_ai_master_1795539266931.jpg',
        timeMs: col === 'w' ? whiteTimeMs : blackTimeMs,
        captured: col === 'w' ? material.capturedByWhite : material.capturedByBlack,
        adv: col === 'w' ? material.whiteAdvantage : -material.whiteAdvantage,
      };
    }
    return {
      name: col === 'w' ? 'Beyaz Oyuncu' : 'Siyah Oyuncu',
      elo: 1200,
      avatar:
        col === 'w'
          ? '/src/assets/images/avatar_ai_tactician_1795539266510.jpg'
          : '/src/assets/images/avatar_ai_master_1795539266931.jpg',
      timeMs: col === 'w' ? whiteTimeMs : blackTimeMs,
      captured: col === 'w' ? material.capturedByWhite : material.capturedByBlack,
      adv: col === 'w' ? material.whiteAdvantage : -material.whiteAdvantage,
    };
  };

  // Admin Hile Motoru: Yalnızca TEK OK (en iyi hamle)
  const cheatArrows: BoardArrow[] = useMemo(() => {
    if (!effectiveCheatActive || gameStatus !== 'playing') {
      return hintArrow.slice(0, 1);
    }
    const bestUci = cheatEval?.bestMoveUci || cheatEval?.lines[0]?.pvUci[0];
    if (!bestUci || bestUci.length < 4) return [];
    return [
      {
        from: bestUci.slice(0, 2),
        to: bestUci.slice(2, 4),
        color: 'rgba(16, 185, 129, 0.94)',
      },
    ];
  }, [cheatEval, effectiveCheatActive, gameStatus, hintArrow]);

  const handleExecuteBestCheatMove = (uciOverride?: string) => {
    if (!effectiveCheatActive || gameStatus !== 'playing') return;
    const uci = uciOverride || cheatEval?.bestMoveUci;
    if (!uci || uci.length < 4) return;
    const turn = chessRef.current.turn();
    const canPlayNow =
      allowedBoardColor === 'both' || allowedBoardColor === turn;
    if (!canPlayNow) return;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = (uci[4] as 'q' | 'r' | 'b' | 'n') || undefined;
    applyMoveToBoard({ from, to, promotion });
  };

  const topSeat = getSeatInfo(topColor);
  const bottomSeat = getSeatInfo(bottomColor);
  const showClock =
    subMode === 'online' || (subMode !== 'practice' && TIME_CONTROLS[timeControlIdx].sec > 0);
  const activeTurn = chessRef.current.turn();
  const topCheatLine = cheatEval?.lines[0];

  return (
    <div className="space-y-5">
      {/* Üst Mod Sekmeleri */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#262522] border border-white/[0.08]">
          {(
            [
              { id: 'ai', label: 'Bilgisayara Karşı', icon: Cpu },
              { id: 'local', label: 'Aynı Cihazda', icon: Users },
              { id: 'online', label: 'Çevrimiçi Oyna', icon: Swords },
              { id: 'practice', label: 'Serbest Tahta', icon: Play },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectSubMode(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#81B64C] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {isInActiveMatch ? (
            <>
              <span className="text-xs text-slate-400 truncate max-w-xs hidden sm:inline">
                Açılış: <span className="text-slate-200 font-medium">{openingName}</span>
              </span>
              {subMode !== 'online' && (
                <button
                  type="button"
                  onClick={() => {
                    chessEngine.stopSearch();
                    setInMatch(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262522] hover:bg-[#383632] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Kuruluma Dön
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">
              Tahtayı açmak için maç ayarını seçip giriş yapın
            </span>
          )}
        </div>
      </div>

      {/* Maç Öncesi Lobi & Kurulum Ekranı (Maça girilmeden satranç masası gösterilmez) */}
      {!isInActiveMatch ? (
        <div className="max-w-2xl mx-auto">
          {subMode === 'online' ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#262522] p-6 sm:p-7 space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Çevrimiçi Özel Oda Lobisi</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Yeni bir oda oluştur veya arkadaşının oda koduyla doğrudan maça katıl.
                </p>
              </div>

              {!isSignedIn ? (
                <div className="space-y-4 rounded-xl bg-[#1E1D1A] border border-white/[0.06] p-5">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Gerçek zamanlı özel odalar kurmak, arkadaşlarının VS davetlerini kabul etmek ve ELO puanlı maçlar oynamak için giriş yap.
                  </p>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    Kayıt Ol / Giriş Yap
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Rengin</label>
                      <select
                        value={preferredColor}
                        onChange={(e) => setPreferredColor(e.target.value as 'w' | 'b' | 'random')}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        <option value="w">Beyaz</option>
                        <option value="b">Siyah</option>
                        <option value="random">Rastgele</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Süre Kontrolü</label>
                      <select
                        value={timeControlIdx}
                        onChange={(e) => setTimeControlIdx(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        {TIME_CONTROLS.filter((t) => t.sec > 0).map((t, idx) => (
                          <option key={t.label} value={idx}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isRoomBusy}
                    onClick={handleCreateRoom}
                    className="w-full py-3 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] disabled:opacity-50 text-white text-sm font-bold transition-colors cursor-pointer"
                  >
                    {isRoomBusy ? 'Oda Oluşturuluyor...' : 'Özel Oda Oluştur ve Maça Gir'}
                  </button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-white/[0.08]" />
                    <span className="px-3 text-[11px] text-slate-500">veya koda göre katıl</span>
                    <div className="flex-grow border-t border-white/[0.08]" />
                  </div>

                  <form onSubmit={handleJoinRoom} className="flex gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder="Oda Kodu (örn. X7K9P2)"
                      className="flex-1 px-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-white placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={isRoomBusy || !joinCodeInput.trim()}
                      className="px-5 py-2.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Odaya Katıl
                    </button>
                  </form>

                  {roomError && <p className="text-xs text-rose-400">{roomError}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-[#262522] p-6 sm:p-7 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {subMode === 'ai'
                      ? 'Bilgisayara Karşı Maç Kurulumu'
                      : subMode === 'local'
                        ? 'Aynı Cihazda 2 Kişilik Maç'
                        : 'Serbest Tahta Kurulumu'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {subMode === 'ai'
                      ? 'Pro Yapay Zekâ botunun zorluğunu, rengini ve süreyi seçip masaya otur.'
                      : subMode === 'local'
                        ? 'Tek ekranda karşılıklı klasik veya süreli satranç maçı başlat.'
                        : 'İstediğin FEN diziliminden serbest antrenman masası aç.'}
                  </p>
                </div>
              </div>

              {subMode === 'ai' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Bot Zorluk Seviyesi</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(DIFFICULTY_CONFIG) as DifficultyLevel[]).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setDifficulty(lvl);
                            setThinkingTimeMs(DIFFICULTY_CONFIG[lvl].defaultTimeMs);
                          }}
                          className={`px-3 py-2.5 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer ${
                            difficulty === lvl
                              ? 'bg-[#81B64C]/25 border-[#81B64C]/70 text-[#BCE38A]'
                              : 'bg-[#1E1D1A] border-white/[0.06] text-slate-300 hover:border-white/15'
                          }`}
                        >
                          <div className="font-bold">{DIFFICULTY_CONFIG[lvl].label}</div>
                          <div className="text-[11px] font-mono opacity-75">
                            ~{DIFFICULTY_CONFIG[lvl].elo} ELO
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      {DIFFICULTY_CONFIG[difficulty].description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Düşünme Süresi ({thinkingTimeMs} ms)
                      </label>
                      <input
                        type="range"
                        min={150}
                        max={3000}
                        step={50}
                        value={thinkingTimeMs}
                        onChange={(e) => setThinkingTimeMs(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Taş Rengi</label>
                      <select
                        value={preferredColor}
                        onChange={(e) => setPreferredColor(e.target.value as 'w' | 'b' | 'random')}
                        className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        <option value="w">Beyaz</option>
                        <option value="b">Siyah</option>
                        <option value="random">Rastgele</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {subMode !== 'practice' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Süre Kontrolü</label>
                  <div className="flex flex-wrap gap-2">
                    {TIME_CONTROLS.map((tc, idx) => (
                      <button
                        key={tc.label}
                        type="button"
                        onClick={() => setTimeControlIdx(idx)}
                        className={`px-3 py-2 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                          timeControlIdx === idx
                            ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                            : 'bg-[#1E1D1A] border-white/[0.06] text-slate-300 hover:border-white/15'
                        }`}
                      >
                        {tc.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {subMode === 'local' && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFlipLocal}
                    onChange={(e) => setAutoFlipLocal(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  Her hamleden sonra tahtayı otomatik çevir
                </label>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Başlangıç Konumu (Opsiyonel FEN)
                </label>
                <input
                  type="text"
                  value={customFenInput}
                  onChange={(e) => setCustomFenInput(e.target.value)}
                  placeholder={INITIAL_FEN}
                  className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200"
                />
                {roomError && <p className="text-xs text-rose-400 mt-1">{roomError}</p>}
              </div>

              <button
                type="button"
                onClick={() => {
                  startNewLocalOrAiGame(customFenInput);
                  setInMatch(true);
                }}
                className="w-full py-3 rounded-xl bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                Maça Gir &amp; Tahtayı Aç
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Ana Arena Düzeni (Sadece Maça Girilince Görünür) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex items-stretch gap-3 max-w-[640px] w-full mx-auto lg:mx-0">
          {effectiveCheatActive && (
            <div className="py-14 shrink-0 flex">
              <EvalBar
                scoreCp={topCheatLine?.scoreCp ?? 0}
                mate={topCheatLine?.mate ?? null}
                orientation={orientation}
              />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Üst Oyuncu Çubuğu */}
            <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#262522] border border-white/[0.08]">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={topSeat.avatar}
                  alt={topSeat.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{topSeat.name}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      ({topSeat.elo})
                    </span>
                    {subMode === 'ai' && isAiThinking && topColor !== playerColor && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#95C95D] shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 min-h-[16px]">
                    {topSeat.captured.slice(0, 10).map((pc, idx) => (
                      <div key={`${pc}-${idx}`} className="w-3.5 h-3.5">
                        <ChessPieceSvg piece={pc} pieceSet={pieceSet} />
                      </div>
                    ))}
                    {topSeat.adv > 0 && (
                      <span className="text-[11px] font-mono tabular-nums text-[#95C95D] ml-1">
                        +{topSeat.adv}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {showClock && (
                <div
                  className={`px-3.5 py-1.5 rounded-md font-mono text-base font-bold tabular-nums transition-colors ${
                    gameStatus === 'playing' && activeTurn === topColor
                      ? topColor === 'w'
                        ? 'bg-white text-[#1E1D1A]'
                        : 'bg-[#171614] text-white border border-white/25'
                      : 'bg-[#1E1D1A] text-slate-400 border border-white/[0.05]'
                  }`}
                >
                  {formatClock(topSeat.timeMs)}
                </div>
              )}
            </div>

            {/* Satranç Tahtası */}
            <ChessBoard
              fen={
                report && report.moves[reportSelectedPly - 1]
                  ? report.moves[reportSelectedPly - 1].fenAfter
                  : fen
              }
              orientation={orientation}
              boardTheme={boardTheme}
              pieceSet={pieceSet}
              interactive={!report}
              allowedColor={allowedBoardColor}
              lastMove={lastMove}
              arrows={cheatArrows}
              onMove={applyMoveToBoard}
            />

            {/* Alt Oyuncu Çubuğu */}
            <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#262522] border border-white/[0.08]">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={bottomSeat.avatar}
                  alt={bottomSeat.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {bottomSeat.name}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      ({bottomSeat.elo})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 min-h-[16px]">
                    {bottomSeat.captured.slice(0, 10).map((pc, idx) => (
                      <div key={`${pc}-${idx}`} className="w-3.5 h-3.5">
                        <ChessPieceSvg piece={pc} pieceSet={pieceSet} />
                      </div>
                    ))}
                    {bottomSeat.adv > 0 && (
                      <span className="text-[11px] font-mono tabular-nums text-[#95C95D] ml-1">
                        +{bottomSeat.adv}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {showClock && (
                <div
                  className={`px-3.5 py-1.5 rounded-md font-mono text-base font-bold tabular-nums transition-colors ${
                    gameStatus === 'playing' && activeTurn === bottomColor
                      ? bottomColor === 'w'
                        ? 'bg-white text-[#1E1D1A]'
                        : 'bg-[#171614] text-white border border-white/25'
                      : 'bg-[#1E1D1A] text-slate-400 border border-white/[0.05]'
                  }`}
                >
                  {formatClock(bottomSeat.timeMs)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sağ Sütun: Admin Hile Motoru + Kontroller + Hamle Geçmişi */}
        <div className="lg:col-span-5 space-y-4">
          {isAdmin && (
            <div className="rounded-xl border border-amber-500/35 bg-[#262522] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-bold text-amber-200">
                    Admin Pro Hile Motoru
                  </span>
                  {isCheatEvaluating && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {onToggleCheatEngineAllowed && (
                    <button
                      type="button"
                      disabled={togglingMasterCheat}
                      onClick={() => void handleToggleMasterCheat()}
                      title="Genel hile motorunu aç veya kapat"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        cheatEngineAllowed
                          ? 'bg-[#1E1D1A] border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
                          : 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-rose-500/25'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {cheatEngineAllowed ? 'Sistem: Açık' : 'Sistem: Kapalı'}
                    </button>
                  )}

                  {cheatEngineAllowed && (
                    <>
                      <select
                        value={cheatDepth}
                        onChange={(e) => setCheatDepth(Number(e.target.value))}
                        className="px-2 py-1 rounded bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200"
                      >
                        <option value={8}>Hızlı Pro</option>
                        <option value={10}>Derin Taktik</option>
                        <option value={13}>Maksimum GM</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setCheatEngineOn((v) => !v)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          cheatEngineOn
                            ? 'bg-amber-500 text-[#1E1D1A]'
                            : 'bg-[#1E1D1A] border border-white/15 text-slate-300 hover:text-white'
                        }`}
                      >
                        {cheatEngineOn ? 'AÇIK' : 'KAPALI'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!cheatEngineAllowed ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#1E1D1A] border border-white/[0.06] px-3 py-2.5">
                  <p className="text-xs text-slate-400">
                    Satranç hile motoru şu anda yönetici ayarından tamamen kapalı.
                  </p>
                  {onToggleCheatEngineAllowed && (
                    <button
                      type="button"
                      disabled={togglingMasterCheat}
                      onClick={() => void handleToggleMasterCheat()}
                      className="px-3 py-1 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-white text-xs font-bold cursor-pointer"
                    >
                      Motoru Aç
                    </button>
                  )}
                </div>
              ) : cheatEngineOn ? (
                topCheatLine ? (
                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-[#1E1D1A] border border-white/[0.06] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-xs font-bold tabular-nums ${
                              (topCheatLine.mate !== null
                                ? topCheatLine.mate > 0
                                : (topCheatLine.scoreCp ?? 0) >= 0)
                                ? 'bg-slate-100 text-slate-900'
                                : 'bg-slate-800 text-slate-100'
                            }`}
                          >
                            {formatEvalLabel(topCheatLine.scoreCp, topCheatLine.mate)}
                          </span>
                          <span className="text-sm font-mono font-bold text-[#95C95D]">
                            {cheatEval.bestMoveSan || cheatEval.bestMoveUci}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          d{topCheatLine.depth}
                          {cheatEval.nodes
                            ? ` · ${cheatEval.nodes >= 1000 ? `${Math.round(cheatEval.nodes / 1000)}K` : cheatEval.nodes} konum`
                            : ''}
                        </span>
                      </div>

                      {cheatEval.insight && (
                        <p className="text-xs text-amber-200/90 flex items-start gap-1.5 leading-relaxed">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{cheatEval.insight}</span>
                        </p>
                      )}

                      {topCheatLine.pvSan.length > 0 && (
                        <p className="text-[11px] font-mono text-slate-400 truncate">
                          Devam: {topCheatLine.pvSan.join(' ')}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        gameStatus !== 'playing' ||
                        (allowedBoardColor !== 'both' &&
                          allowedBoardColor !== chessRef.current.turn())
                      }
                      onClick={() => handleExecuteBestCheatMove()}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Tek Okla En İyi Hamleyi Oyna ({cheatEval.bestMoveSan || cheatEval.bestMoveUci})
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Pro motor en keskin hamleyi hesaplıyor...</p>
                )
              ) : (
                <p className="text-xs text-slate-400">
                  Tahtada tek okla en keskin Pro hamleyi, taktik analizi ve değerlendirme çubuğunu görmek için AÇIK konuma getirin.
                </p>
              )}
            </div>
          )}

          {/* Çevrimiçi Özel Oda Lobisi */}
          {subMode === 'online' && (
            <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Çevrimiçi Özel Oda</h2>
              {!isSignedIn ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Gerçek zamanlı özel odalar kurmak, arkadaşlarının VS davetlerini kabul etmek ve ELO puanlı maçlar oynamak için giriş yap.
                  </p>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    Kayıt Ol / Giriş Yap
                  </button>
                </div>
              ) : !activeRoomCode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Rengin</label>
                      <select
                        value={preferredColor}
                        onChange={(e) => setPreferredColor(e.target.value as 'w' | 'b' | 'random')}
                        className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        <option value="w">Beyaz</option>
                        <option value="b">Siyah</option>
                        <option value="random">Rastgele</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Süre Kontrolü</label>
                      <select
                        value={timeControlIdx}
                        onChange={(e) => setTimeControlIdx(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        {TIME_CONTROLS.filter((t) => t.sec > 0).map((t, idx) => (
                          <option key={t.label} value={idx}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isRoomBusy}
                    onClick={handleCreateRoom}
                    className="w-full py-2.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isRoomBusy ? 'Oda Oluşturuluyor...' : 'Özel Oda Oluştur'}
                  </button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-white/[0.08]" />
                    <span className="px-3 text-[11px] text-slate-500">veya koda göre katıl</span>
                    <div className="flex-grow border-t border-white/[0.08]" />
                  </div>

                  <form onSubmit={handleJoinRoom} className="flex gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder="Oda Kodu (örn. X7K9P2)"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-white placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={isRoomBusy || !joinCodeInput.trim()}
                      className="px-4 py-2 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Katıl
                    </button>
                  </form>

                  {roomError && <p className="text-xs text-rose-400">{roomError}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#1E1D1A] border border-white/[0.08]">
                    <div>
                      <p className="text-[11px] text-slate-400">Oda Kodu</p>
                      <p className="text-lg font-mono font-bold tracking-wider text-emerald-400">
                        {activeRoomCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#383632] hover:bg-[#45423D] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                    >
                      {copiedCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedCode ? 'Kopyalandı' : 'Kodu Kopyala'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300">
                    {roomData?.status === 'waiting'
                      ? 'Arkadaşının bu kodla odaya katılması bekleniyor...'
                      : roomData?.status === 'active'
                        ? `Maç devam ediyor · ${activeTurn === playerColor ? 'Sıra sende' : 'Rakibin sırası'}`
                        : `Maç sona erdi · ${roomData?.termination || 'Tamamlandı'}`}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (roomData && roomData.status === 'waiting') {
                        if (siteToken) {
                          void finishSiteRoom(siteToken, roomData.roomCode, 'draw', 'İptal Edildi');
                        } else {
                          void finishRoomEarly(roomData.roomCode, roomData, 'draw', 'İptal Edildi');
                        }
                      }
                      setActiveRoomCode(null);
                      setRoomData(null);
                      setRoomError(null);
                      setReport(null);
                      setGameResult(null);
                      setGameStatus('playing');
                      setMoveHistory([]);
                      setPgn('');
                      setLastMove(null);
                      chessRef.current = new Chess(INITIAL_FEN);
                      setFen(INITIAL_FEN);
                      setWhiteTimeMs(600000);
                      setBlackTimeMs(600000);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Odadan Ayrıl
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bilgisayar / Yerel / Antrenman Yapılandırma Kartı */}
          {subMode !== 'online' && (
            <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">
                  {subMode === 'ai'
                    ? 'Bilgisayara Karşı Oyna'
                    : subMode === 'local'
                      ? 'Aynı Cihazda Kurulum'
                      : 'Serbest Tahta Kurulumu'}
                </h2>
                <button
                  type="button"
                  onClick={() => startNewLocalOrAiGame()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Yeni Oyun
                </button>
              </div>

              {subMode === 'ai' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Bot Zorluk Seviyesi</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(DIFFICULTY_CONFIG) as DifficultyLevel[]).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setDifficulty(lvl);
                            setThinkingTimeMs(DIFFICULTY_CONFIG[lvl].defaultTimeMs);
                          }}
                          className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            difficulty === lvl
                              ? 'bg-[#81B64C]/25 border-[#81B64C]/70 text-[#BCE38A]'
                              : 'bg-[#1E1D1A] border-white/[0.06] text-slate-300 hover:border-white/15'
                          }`}
                        >
                          {DIFFICULTY_CONFIG[lvl].label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {DIFFICULTY_CONFIG[difficulty].description} (≈ {DIFFICULTY_CONFIG[difficulty].elo} ELO)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Düşünme Süresi ({thinkingTimeMs} ms)
                      </label>
                      <input
                        type="range"
                        min={150}
                        max={3000}
                        step={50}
                        value={thinkingTimeMs}
                        onChange={(e) => setThinkingTimeMs(Number(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Taş Rengi</label>
                      <select
                        value={preferredColor}
                        onChange={(e) => setPreferredColor(e.target.value as 'w' | 'b' | 'random')}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                      >
                        <option value="w">Beyaz</option>
                        <option value="b">Siyah</option>
                        <option value="random">Rastgele</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {subMode !== 'practice' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Süre Kontrolü</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_CONTROLS.map((tc, idx) => (
                      <button
                        key={tc.label}
                        type="button"
                        onClick={() => setTimeControlIdx(idx)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                          timeControlIdx === idx
                            ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                            : 'bg-[#1E1D1A] border-white/[0.06] text-slate-300 hover:border-white/15'
                        }`}
                      >
                        {tc.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {subMode === 'local' && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFlipLocal}
                    onChange={(e) => setAutoFlipLocal(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  Her hamleden sonra tahtayı otomatik çevir
                </label>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Başlangıç Konumu (FEN)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customFenInput}
                    onChange={(e) => setCustomFenInput(e.target.value)}
                    placeholder={INITIAL_FEN}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-mono text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => startNewLocalOrAiGame(customFenInput)}
                    className="px-3 py-1.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    FEN Yükle
                  </button>
                </div>
                {roomError && <p className="text-xs text-rose-400 mt-1">{roomError}</p>}
              </div>
            </div>
          )}

          {/* Araç Çubuğu ve Hamle Geçmişi */}
          <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                <FlipVertical2 className="w-3.5 h-3.5" />
                Tahtayı Çevir
              </button>

              {subMode !== 'online' && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndoMove}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] disabled:opacity-40 border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Geri Al
                </button>
              )}

              {isAdmin && cheatEngineAllowed && subMode === 'practice' && (
                <button
                  type="button"
                  onClick={handleCoachHint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-xs font-medium text-amber-300 transition-colors cursor-pointer"
                >
                  En İyi Hamleyi Öner
                </button>
              )}

              {gameStatus === 'playing' && subMode !== 'practice' && (
                <button
                  type="button"
                  onClick={handleResign}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-medium text-rose-300 transition-colors cursor-pointer ml-auto"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Terk Et
                </button>
              )}
            </div>

            {isAdmin && hintText && (
              <p className="text-xs text-amber-300 font-medium bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                {hintText}
              </p>
            )}

            <div className="rounded-lg bg-[#1E1D1A] border border-white/[0.06] p-3 h-44 overflow-y-auto">
              {movePairs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-12">
                  Notasyonu kaydetmek için ilk hamleyi yapın.
                </p>
              ) : (
                <div className="space-y-1 font-mono text-xs tabular-nums">
                  {movePairs.map((pair) => (
                    <div
                      key={pair.num}
                      className="grid grid-cols-12 items-center py-0.5 px-1.5 rounded hover:bg-white/[0.03]"
                    >
                      <span className="col-span-2 text-slate-500">{pair.num}.</span>
                      <span className="col-span-5 text-slate-100">{pair.white}</span>
                      <span className="col-span-5 text-slate-300">{pair.black || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Oyun Sonu & Admin Raporu */}
          {gameResult && (
            <div className="rounded-xl border border-[#81B64C]/40 bg-[#262522] p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#95C95D]">{gameResult.termination}</p>
                  <h3 className="text-lg font-bold text-white">
                    Sonuç: {gameResult.result}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {subMode !== 'online' && (
                    <button
                      type="button"
                      onClick={() => startNewLocalOrAiGame()}
                      className="px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] text-xs font-bold text-white transition-colors cursor-pointer"
                    >
                      Tekrar Oyna
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenInStudio(pgn, fen)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                      Motor Stüdyosu
                    </button>
                  )}
                </div>
              </div>

              {isAdmin && !report && moveHistory.length > 0 && (
                <button
                  type="button"
                  disabled={isGeneratingReport}
                  onClick={handleRunPostGameAnalysis}
                  className="w-full py-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-xs font-semibold text-amber-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isGeneratingReport ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Oyun Analiz Ediliyor ({reportProgress.done}/{reportProgress.total} konum)...
                    </>
                  ) : (
                    'Admin Pro Maç Raporunu Oluştur'
                  )}
                </button>
              )}
            </div>
          )}

          {isAdmin && report && (
            <GameReportPanel
              report={report}
              whiteName={getSeatInfo('w').name}
              blackName={getSeatInfo('b').name}
              selectedPly={reportSelectedPly}
              onSelectPly={setReportSelectedPly}
              onOpenInStudio={() => onOpenInStudio(pgn, fen)}
            />
          )}
        </div>
      </div>
      )}
    </div>
  );
};
