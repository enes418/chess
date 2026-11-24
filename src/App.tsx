import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  BookOpen,
  Check,
  Cpu,
  Crown,
  Home,
  LogIn,
  LogOut,
  Menu,
  Puzzle,
  ShieldCheck,
  Swords,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import type {
  AppSection,
  ChessPuzzle,
  GameRecord,
  PlayerProfile,
  PlaySubMode,
  SocialState,
  UserSettings,
} from './types/chess';
import {
  auth,
  DEFAULT_AVATARS,
  ensurePlayerProfile,
  loadPrivateSettings,
  saveGameRecord,
  savePrivateSettings,
  signInWithGoogle,
  signOutUser,
  subscribeRecentGames,
  updatePlayerProfile,
} from './services/firebase';
import {
  adminSetCheatEngine,
  getSocialState,
  respondMatchChallenge,
  saveSiteGame,
  subscribeSocialEvents,
  updateSiteProfile,
  updateSiteSettings,
  type AuthSessionResponse,
} from './services/localAuthApi';
import { soundFX } from './utils/sound';
import { AuthModal } from './components/AuthModal';
import { DashboardView } from './views/DashboardView';
import { PlayArenaView } from './views/PlayArenaView';
import { FriendsView } from './views/FriendsView';
import { AnalysisStudioView } from './views/AnalysisStudioView';
import { PuzzlesView } from './views/PuzzlesView';
import { OpeningsView } from './views/OpeningsView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';

const LS_SETTINGS_KEY = 'chess_arena_settings_v1';
const LS_LOCAL_GAMES_KEY = 'chess_arena_local_games_v1';
const LS_LOCAL_PROFILE_KEY = 'chess_arena_local_profile_v1';

const DEFAULT_SETTINGS: UserSettings = {
  boardTheme: 'emerald',
  pieceSet: 'staunton',
  soundEnabled: true,
};

const DEFAULT_GUEST_PROFILE: PlayerProfile = {
  uid: 'local-guest',
  username: 'Misafir Oyuncu',
  avatarUrl: DEFAULT_AVATARS[1],
  elo: 1200,
  puzzleRating: 1200,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  solvedPuzzleIds: [],
  favoriteOpenings: [],
};

const EMPTY_SOCIAL_STATE: SocialState = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  incomingChallenges: [],
  outgoingChallenges: [],
};

export default function App() {
  const [section, setSection] = useState<AppSection>('dashboard');
  const [playSubMode, setPlaySubMode] = useState<PlaySubMode>('ai');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Görünümler arası aktarım verileri
  const [playInitialFen, setPlayInitialFen] = useState<string | undefined>(undefined);
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);
  const [studioPgn, setStudioPgn] = useState<string | undefined>(undefined);
  const [studioFen, setStudioFen] = useState<string | undefined>(undefined);

  // Site İçi Hesap Durumu (Bearer token sadece bellekte tutulur)
  const [siteToken, setSiteToken] = useState<string | null>(null);
  const [siteProfile, setSiteProfile] = useState<PlayerProfile | null>(null);
  const [siteGames, setSiteGames] = useState<GameRecord[]>([]);
  const [cheatEngineAllowed, setCheatEngineAllowed] = useState<boolean>(true);

  // Arkadaşlar ve VS Davetleri Durumu
  const [socialState, setSocialState] = useState<SocialState>(EMPTY_SOCIAL_STATE);
  const handledChallengeIdsRef = useRef<Set<string>>(new Set());

  // İkincil Firebase Google Auth Durumu
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [cloudProfile, setCloudProfile] = useState<PlayerProfile | null>(null);
  const [cloudGames, setCloudGames] = useState<GameRecord[]>([]);

  const [guestProfile, setGuestProfile] = useState<PlayerProfile>(() => {
    try {
      const raw = localStorage.getItem(LS_LOCAL_PROFILE_KEY);
      if (raw) return { ...DEFAULT_GUEST_PROFILE, ...JSON.parse(raw) };
    } catch {
      // Depolama hatası yoksayılır
    }
    return DEFAULT_GUEST_PROFILE;
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const raw = localStorage.getItem(LS_SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // Depolama hatası yoksayılır
    }
    return DEFAULT_SETTINGS;
  });

  const [localGames, setLocalGames] = useState<GameRecord[]>(() => {
    try {
      const raw = localStorage.getItem(LS_LOCAL_GAMES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Depolama hatası yoksayılır
    }
    return [];
  });

  useEffect(() => {
    soundFX.enabled = settings.soundEnabled;
  }, [settings.soundEnabled]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        try {
          const prof = await ensurePlayerProfile(user);
          setCloudProfile(prof);
          const priv = await loadPrivateSettings(user.uid);
          if (priv) {
            setSettings(priv);
            localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(priv));
          }
        } catch (err) {
          console.error('Firebase profili başlatılamadı:', err);
        }
      } else {
        setCloudProfile(null);
        setCloudGames([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const unsub = subscribeRecentGames(firebaseUser.uid, (games) => {
      setCloudGames(games);
    });
    return () => unsub();
  }, [authReady, firebaseUser]);

  const enterChallengeRoom = useCallback((roomCode: string) => {
    setPendingRoomCode(roomCode);
    setPlaySubMode('online');
    setSection('play');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const applySocialSync = useCallback(
    (next: SocialState) => {
      setSocialState(next);
      // Davet gönderen oyuncu için davet kabul edildiğinde otomatik odaya geç
      for (const ch of next.outgoingChallenges) {
        if (
          ch.status === 'accepted' &&
          ch.roomCode &&
          !handledChallengeIdsRef.current.has(ch.id)
        ) {
          handledChallengeIdsRef.current.add(ch.id);
          enterChallengeRoom(ch.roomCode);
          break;
        }
      }
    },
    [enterChallengeRoom],
  );

  const refreshSocial = useCallback(async () => {
    if (!siteToken) return;
    const st = await getSocialState(siteToken);
    applySocialSync(st);
  }, [applySocialSync, siteToken]);

  useEffect(() => {
    if (!siteToken) {
      setSocialState(EMPTY_SOCIAL_STATE);
      handledChallengeIdsRef.current.clear();
      return;
    }
    const unsub = subscribeSocialEvents(siteToken, applySocialSync);
    return () => unsub();
  }, [applySocialSync, siteToken]);

  const isSignedIn = Boolean(siteToken || firebaseUser);
  const activeProfile = siteToken
    ? siteProfile
    : firebaseUser
      ? cloudProfile
      : guestProfile;
  const activeGames = siteToken
    ? siteGames
    : firebaseUser
      ? cloudGames
      : localGames;

  const isAdmin = Boolean(siteToken && siteProfile?.role === 'admin');

  const handleSiteAuthSuccess = (session: AuthSessionResponse) => {
    setSiteToken(session.token);
    setSiteProfile(session.profile);
    setSiteGames(session.games);
    setSettings(session.settings);
    if (typeof session.cheatEngineAllowed === 'boolean') {
      setCheatEngineAllowed(session.cheatEngineAllowed);
    }
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(session.settings));
    } catch {
      // Depolama hatası yoksayılır
    }
    setAuthModalOpen(false);
    if (session.profile.role === 'admin') {
      setSection('admin');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      setSiteToken(null);
      setSiteProfile(null);
      setSiteGames([]);
      setAuthModalOpen(false);
      if (section === 'admin' || section === 'analysis') {
        setSection('dashboard');
      }
    } catch (err) {
      console.error('Google girişi başarısız oldu:', err);
    }
  };

  const handleSignOut = async () => {
    if (siteToken) {
      setSiteToken(null);
      setSiteProfile(null);
      setSiteGames([]);
      setSocialState(EMPTY_SOCIAL_STATE);
    }
    if (firebaseUser) {
      await signOutUser();
    }
    if (section === 'admin' || section === 'analysis') {
      setSection('dashboard');
    }
  };

  const handleNavigate = (nextSection: AppSection, nextSubMode?: PlaySubMode) => {
    if ((nextSection === 'admin' || nextSection === 'analysis') && !isAdmin) {
      return;
    }
    setSection(nextSection);
    if (nextSubMode) {
      setPlaySubMode(nextSubMode);
    }
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleCheatEngineAllowed = async (enabled: boolean) => {
    if (!siteToken || !isAdmin) return;
    const res = await adminSetCheatEngine(siteToken, enabled);
    setCheatEngineAllowed(res.cheatEngineAllowed);
  };

  const handleUpdateSettings = async (next: UserSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Kota hatası yoksayılır
    }
    if (siteToken) {
      await updateSiteSettings(siteToken, next);
    } else if (firebaseUser) {
      await savePrivateSettings(firebaseUser.uid, next);
    }
  };

  const handleUpdateProfile = async (username: string, avatarUrl: string) => {
    if (siteToken && siteProfile) {
      const updated = await updateSiteProfile(siteToken, { username, avatarUrl });
      setSiteProfile(updated);
    } else if (firebaseUser && cloudProfile) {
      await updatePlayerProfile(firebaseUser.uid, { username, avatarUrl });
      setCloudProfile({ ...cloudProfile, username, avatarUrl });
    } else {
      const updated = { ...guestProfile, username, avatarUrl };
      setGuestProfile(updated);
      localStorage.setItem(LS_LOCAL_PROFILE_KEY, JSON.stringify(updated));
    }
  };

  const handleGameCompleted = useCallback(
    async (
      record: Omit<GameRecord, 'id' | 'createdAtMs'>,
      eloDelta: number,
      outcome: 'win' | 'loss' | 'draw',
      openingName: string,
    ) => {
      const curr = siteToken ? siteProfile : firebaseUser ? cloudProfile : guestProfile;
      if (!curr) return;

      const nextOpenings = Array.from(
        new Set(
          [openingName, ...(curr.favoriteOpenings || [])].filter(
            (o) => o && o !== 'Başlangıç Konumu' && o !== 'Starting Position',
          ),
        ),
      ).slice(0, 10);

      const nextStats = {
        elo: Math.max(100, Math.min(3500, curr.elo + eloDelta)),
        gamesPlayed: curr.gamesPlayed + 1,
        wins: curr.wins + (outcome === 'win' ? 1 : 0),
        losses: curr.losses + (outcome === 'loss' ? 1 : 0),
        draws: curr.draws + (outcome === 'draw' ? 1 : 0),
        favoriteOpenings: nextOpenings,
      };

      if (siteToken && siteProfile) {
        const saved = await saveSiteGame(siteToken, {
          ...record,
          ownerId: siteProfile.uid,
          participantIds: [siteProfile.uid],
        });
        setSiteGames((prev) => [saved, ...prev]);
        const updatedProf = await updateSiteProfile(siteToken, nextStats);
        setSiteProfile(updatedProf);
      } else if (firebaseUser && cloudProfile) {
        await saveGameRecord({
          ...record,
          ownerId: firebaseUser.uid,
          participantIds: [firebaseUser.uid],
        });
        await updatePlayerProfile(firebaseUser.uid, nextStats);
        setCloudProfile({ ...cloudProfile, ...nextStats });
      } else {
        const localRec: GameRecord = {
          ...record,
          id: `local_${Date.now()}`,
          createdAtMs: Date.now(),
        };
        const updatedGames = [localRec, ...localGames].slice(0, 40);
        setLocalGames(updatedGames);
        localStorage.setItem(LS_LOCAL_GAMES_KEY, JSON.stringify(updatedGames));

        const updatedProf = { ...guestProfile, ...nextStats };
        setGuestProfile(updatedProf);
        localStorage.setItem(LS_LOCAL_PROFILE_KEY, JSON.stringify(updatedProf));
      }
    },
    [cloudProfile, firebaseUser, guestProfile, localGames, siteProfile, siteToken],
  );

  const handlePuzzleSolved = async (puzzle: ChessPuzzle, firstTry: boolean) => {
    const curr = siteToken ? siteProfile : firebaseUser ? cloudProfile : guestProfile;
    if (!curr) return;

    const alreadySolved = curr.solvedPuzzleIds.includes(puzzle.id);
    const delta = alreadySolved ? 0 : firstTry ? 14 : 6;
    const nextRating = Math.max(100, Math.min(3500, curr.puzzleRating + delta));
    const nextSolved = Array.from(new Set([...curr.solvedPuzzleIds, puzzle.id])).slice(0, 500);

    if (siteToken && siteProfile) {
      const updated = await updateSiteProfile(siteToken, {
        puzzleRating: nextRating,
        solvedPuzzleIds: nextSolved,
      });
      setSiteProfile(updated);
    } else if (firebaseUser && cloudProfile) {
      await updatePlayerProfile(firebaseUser.uid, {
        puzzleRating: nextRating,
        solvedPuzzleIds: nextSolved,
      });
      setCloudProfile({
        ...cloudProfile,
        puzzleRating: nextRating,
        solvedPuzzleIds: nextSolved,
      });
    } else {
      const updated = {
        ...guestProfile,
        puzzleRating: nextRating,
        solvedPuzzleIds: nextSolved,
      };
      setGuestProfile(updated);
      localStorage.setItem(LS_LOCAL_PROFILE_KEY, JSON.stringify(updated));
    }
  };

  const handleOpenInStudio = (pgn: string, fen: string) => {
    if (!isAdmin) return;
    setStudioPgn(pgn);
    setStudioFen(fen);
    handleNavigate('analysis');
  };

  const handlePracticeFromOpening = (fen: string) => {
    setPlayInitialFen(fen);
    handleNavigate('play', 'ai');
  };

  const handleAnalyzeGameRecord = (game: GameRecord) => {
    if (!isAdmin) return;
    setStudioPgn(game.pgn);
    setStudioFen(game.finalFen);
    handleNavigate('analysis');
  };

  const handleBannerChallengeRespond = async (
    challengeId: string,
    action: 'accept' | 'decline',
  ) => {
    if (!siteToken) return;
    try {
      const res = await respondMatchChallenge(siteToken, challengeId, action);
      await refreshSocial();
      if (action === 'accept' && res.room?.roomCode) {
        handledChallengeIdsRef.current.add(challengeId);
        enterChallengeRoom(res.room.roomCode);
      }
    } catch (err) {
      console.error('VS daveti yanıtlanamadı:', err);
    }
  };

  const socialBadgeCount =
    socialState.incomingRequests.length + socialState.incomingChallenges.length;

  const navItems: {
    id: AppSection;
    label: string;
    icon: typeof Home;
    adminOnly?: boolean;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Ana Sayfa', icon: Home },
    { id: 'play', label: 'Oyna', icon: Swords },
    { id: 'friends', label: 'Arkadaşlar', icon: Users, badge: socialBadgeCount },
    { id: 'puzzles', label: 'Bulmacalar', icon: Puzzle },
    { id: 'openings', label: 'Açılışlar', icon: BookOpen },
    { id: 'profile', label: 'Profil', icon: UserIcon },
    ...(isAdmin
      ? [
          { id: 'analysis' as AppSection, label: 'Motor Stüdyosu', icon: Cpu, adminOnly: true },
          { id: 'admin' as AppSection, label: 'Admin Paneli', icon: ShieldCheck, adminOnly: true },
        ]
      : []),
  ];

  const topIncomingChallenge = socialState.incomingChallenges[0];

  return (
    <div className="min-h-screen bg-[#302E2B] text-[#F3F3F2] flex flex-col lg:flex-row">
      {/* Chess.com Tarzı Sol Dikey Menü (Masaüstü) */}
      <aside className="hidden lg:flex lg:w-[216px] shrink-0 bg-[#262522] border-r border-white/[0.06] flex-col justify-between sticky top-0 h-screen">
        <div className="p-3 space-y-5">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#81B64C] flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-display font-bold tracking-tight text-white whitespace-nowrap">
              Chess Arena
            </span>
          </button>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? item.adminOnly
                        ? 'bg-amber-500/20 text-amber-200'
                        : 'bg-[#383632] text-white'
                      : item.adminOnly
                        ? 'text-amber-300/80 hover:bg-amber-500/10 hover:text-amber-200'
                        : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active
                          ? item.adminOnly
                            ? 'text-amber-400'
                            : 'text-[#95C95D]'
                          : item.adminOnly
                            ? 'text-amber-400/75'
                            : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {Boolean(item.badge && item.badge > 0) && (
                    <span className="px-1.5 py-0.5 rounded bg-[#81B64C] text-[10px] font-mono font-bold text-white tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Alt Hesap Alanı */}
        <div className="p-3 border-t border-white/[0.06] space-y-2">
          {isSignedIn ? (
            <>
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="w-full p-2.5 rounded-xl bg-[#1E1D1A] hover:bg-[#33312D] border border-white/[0.06] flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              >
                <img
                  src={activeProfile?.avatarUrl || DEFAULT_AVATARS[1]}
                  alt={activeProfile?.username || 'Oyuncu'}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {activeProfile?.username || 'Hesap'}
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-400">
                    {isAdmin ? 'Admin · ' : ''}
                    {activeProfile?.elo ?? 1200} ELO
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2 px-3 rounded-lg hover:bg-white/[0.05] text-xs font-medium text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Çıkış Yap
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Kayıt Ol / Giriş Yap
            </button>
          )}
        </div>
      </aside>

      {/* Mobil / Tablet Üst Çubuk */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#262522]/95 backdrop-blur-md border-b border-white/[0.08]">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="inline-flex items-center gap-2 text-base font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Crown className="w-4 h-4 text-[#81B64C]" />
            Chess Arena
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {isSignedIn ? (
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="px-3 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
              >
                {activeProfile?.username || 'Hesap'} · {activeProfile?.elo ?? 1200}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                Giriş Yap
              </button>
            )}

            <button
              type="button"
              aria-label="Menüyü aç/kapat"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="p-2 rounded-lg text-slate-300 hover:bg-white/[0.06] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-white/[0.08] bg-[#21201D] px-4 py-3 flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                  section === item.id
                    ? item.adminOnly
                      ? 'bg-amber-600 text-white'
                      : 'bg-[#81B64C] text-white'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                <span>{item.label}</span>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Ana Çalışma Alanı */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Anlık Gelen VS Daveti Bildirim Çubuğu */}
          {topIncomingChallenge && (
            <div className="rounded-xl border border-[#81B64C]/50 bg-[#262522] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#81B64C]/20 border border-[#81B64C]/40 flex items-center justify-center shrink-0">
                  <Swords className="w-4 h-4 text-[#95C95D]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {topIncomingChallenge.fromUser.username} ({topIncomingChallenge.fromUser.elo}{' '}
                    ELO) sana VS daveti gönderdi!
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Süre:{' '}
                    <span className="font-mono text-slate-200">
                      {Math.round(topIncomingChallenge.timeControlSec / 60)} +{' '}
                      {topIncomingChallenge.incrementSec}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleBannerChallengeRespond(topIncomingChallenge.id, 'accept')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] text-white text-xs font-bold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Kabul Et ve Maça Başla
                </button>
                <button
                  type="button"
                  onClick={() => void handleBannerChallengeRespond(topIncomingChallenge.id, 'decline')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-rose-500/20 border border-white/10 text-xs font-medium text-slate-300 hover:text-rose-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Reddet
                </button>
              </div>
            </div>
          )}

          {section === 'dashboard' && (
            <DashboardView
              profile={activeProfile}
              recentGames={activeGames}
              isAdmin={isAdmin}
              onNavigate={handleNavigate}
              onAnalyzeGame={handleAnalyzeGameRecord}
            />
          )}

          {section === 'play' && (
            <PlayArenaView
              subMode={playSubMode}
              onChangeSubMode={setPlaySubMode}
              initialFen={playInitialFen}
              onConsumeInitialFen={() => setPlayInitialFen(undefined)}
              initialRoomCode={pendingRoomCode}
              onJoinedInitialRoom={() => setPendingRoomCode(null)}
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              profile={activeProfile}
              isSignedIn={isSignedIn}
              isAdmin={isAdmin}
              cheatEngineAllowed={cheatEngineAllowed}
              onToggleCheatEngineAllowed={handleToggleCheatEngineAllowed}
              siteToken={siteToken}
              onSignIn={() => setAuthModalOpen(true)}
              onGameCompleted={handleGameCompleted}
              onOpenInStudio={handleOpenInStudio}
            />
          )}

          {section === 'friends' && (
            <FriendsView
              siteToken={siteToken}
              socialState={socialState}
              onRefreshSocial={refreshSocial}
              onEnterRoom={enterChallengeRoom}
              onSignIn={() => setAuthModalOpen(true)}
            />
          )}

          {section === 'analysis' && isAdmin && (
            <AnalysisStudioView
              initialPgn={studioPgn}
              initialFen={studioFen}
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
            />
          )}

          {section === 'puzzles' && (
            <PuzzlesView
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              profile={activeProfile}
              localSolvedIds={isSignedIn ? [] : guestProfile.solvedPuzzleIds}
              onPuzzleSolved={handlePuzzleSolved}
            />
          )}

          {section === 'openings' && (
            <OpeningsView
              boardTheme={settings.boardTheme}
              pieceSet={settings.pieceSet}
              isAdmin={isAdmin}
              onPracticeVsAi={handlePracticeFromOpening}
              onOpenInStudio={handleOpenInStudio}
            />
          )}

          {section === 'profile' && (
            <ProfileView
              profile={activeProfile}
              isSignedIn={isSignedIn}
              isAdmin={isAdmin}
              settings={settings}
              recentGames={activeGames}
              onSignIn={() => setAuthModalOpen(true)}
              onSiteAuthSuccess={handleSiteAuthSuccess}
              onGoogleSignIn={handleGoogleSignIn}
              onSignOut={handleSignOut}
              onUpdateProfile={handleUpdateProfile}
              onUpdateSettings={handleUpdateSettings}
              onAnalyzeGame={handleAnalyzeGameRecord}
            />
          )}

          {section === 'admin' && isAdmin && (
            <AdminView
              siteToken={siteToken}
              cheatEngineAllowed={cheatEngineAllowed}
              onCheatEngineChanged={setCheatEngineAllowed}
            />
          )}
        </main>

        <footer className="border-t border-white/[0.06] py-4 px-4 sm:px-8 text-xs text-slate-500">
          <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <span>Chess Arena · Çevrimiçi Satranç, Arkadaşlar &amp; Bulmacalar</span>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => handleNavigate('play', 'online')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Çevrimiçi Oyna
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('friends')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Arkadaşlar &amp; VS
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('play', 'ai')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Bilgisayara Karşı
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('puzzles')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Bulmacalar
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('openings')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Açılışlar
              </button>
            </div>
          </div>
        </footer>
      </div>

      <AuthModal
        open={authModalOpen}
        initialMode="register"
        onSuccess={handleSiteAuthSuccess}
        onGoogleSignIn={handleGoogleSignIn}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}
