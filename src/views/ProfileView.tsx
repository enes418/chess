import React, { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  LogIn,
  LogOut,
  Puzzle,
  Save,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BoardThemeId,
  GameRecord,
  PieceSetId,
  PlayerProfile,
  UserSettings,
} from '../types/chess';
import { BOARD_THEMES } from '../services/chessLogic';
import { DEFAULT_AVATARS } from '../services/firebase';
import type { AuthSessionResponse } from '../services/localAuthApi';
import { AuthFormCard } from '../components/AuthModal';

interface ProfileViewProps {
  profile: PlayerProfile | null;
  isSignedIn: boolean;
  isAdmin?: boolean;
  settings: UserSettings;
  recentGames: GameRecord[];
  onSignIn: () => void;
  onSiteAuthSuccess: (session: AuthSessionResponse) => void;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpdateProfile: (username: string, avatarUrl: string) => Promise<void>;
  onUpdateSettings: (settings: UserSettings) => Promise<void>;
  onAnalyzeGame: (game: GameRecord) => void;
}

const PIECE_SET_TR: Record<PieceSetId, string> = {
  staunton: 'Staunton',
  modern: 'Modern',
  classic: 'Klasik',
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  isSignedIn,
  isAdmin = false,
  settings,
  recentGames,
  onSignIn,
  onSiteAuthSuccess,
  onGoogleSignIn,
  onSignOut,
  onUpdateProfile,
  onUpdateSettings,
  onAnalyzeGame,
}) => {
  const [usernameInput, setUsernameInput] = useState<string>(profile?.username || 'Büyükusta');
  const [avatarInput, setAvatarInput] = useState<string>(
    profile?.avatarUrl || DEFAULT_AVATARS[0],
  );
  const [savedFlag, setSavedFlag] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setUsernameInput(profile.username);
      setAvatarInput(profile.avatarUrl);
    }
  }, [profile]);

  const gamesPlayed = profile?.gamesPlayed ?? recentGames.length;
  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    try {
      await onUpdateProfile(usernameInput, avatarInput);
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 1800);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Profil güncellenemedi.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-white/[0.08] bg-[#262522] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src={profile?.avatarUrl || DEFAULT_AVATARS[0]}
            alt={profile?.username || 'Oyuncu Avatarı'}
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-xl object-cover border border-white/15 shrink-0"
          />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {profile?.username || 'Misafir Oyuncu'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isSignedIn
                ? 'Chess Arena Hesabı · Dereceli Puan & Arkadaş Sistemi Aktif'
                : 'Misafir Oturumu · Puanlarını kaydetmek ve arkadaş eklemek için giriş yap'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.06] border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Kayıt Ol / Giriş Yap
            </button>
          )}
        </div>
      </div>

      {!isSignedIn && (
        <div className="max-w-xl">
          <AuthFormCard
            initialMode="register"
            onSuccess={onSiteAuthSuccess}
            onGoogleSignIn={onGoogleSignIn}
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ELO Puanı</span>
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
            {profile?.elo ?? 1200}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Bulmaca Puanı</span>
            <Puzzle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
            {profile?.puzzleRating ?? 1200}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Karşılaşma (G/M/B)</span>
            <Swords className="w-4 h-4 text-[#81B64C]" />
          </div>
          <p className="mt-2 text-2xl font-mono font-bold tabular-nums text-white">
            {wins}/{losses}/{draws}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Kazanma Oranı</span>
            <Trophy className="w-4 h-4 text-[#81B64C]" />
          </div>
          <p className="mt-2 text-2xl font-mono font-bold tabular-nums text-[#81B64C]">
            %{winRate}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4"
        >
          <h2 className="text-base font-semibold text-white">Kimlik ve Repertuvar</h2>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Kullanıcı Adı</label>
            <input
              type="text"
              maxLength={32}
              minLength={2}
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Profil Simgesi Seç</label>
            <div className="flex items-center gap-3">
              {DEFAULT_AVATARS.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setAvatarInput(url)}
                  className={`rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    avatarInput === url ? 'border-[#81B64C] scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={url}
                    alt="Avatar seçeneği"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Favori Açılışlar</p>
            <p className="text-xs text-slate-200">
              {profile?.favoriteOpenings?.length
                ? profile.favoriteOpenings.join(' · ')
                : 'En sık oynadığın açılışları görmek için maç tamamla.'}
            </p>
          </div>

          {profileError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
              {profileError}
            </p>
          )}

          <button
            type="submit"
            disabled={!isSignedIn}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] disabled:opacity-40 border-b-[3px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            {savedFlag ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedFlag ? 'Profil Kaydedildi' : isSignedIn ? 'Profili Kaydet' : 'Kaydetmek İçin Giriş Yap'}
          </button>
        </form>

        <div className="lg:col-span-6 rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Tahta ve Ses Tercihleri</h2>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Tahta Teması</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => {
                const t = BOARD_THEMES[id];
                const active = settings.boardTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, boardTheme: id })}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#81B64C]/20 border-[#81B64C]/60 text-white'
                        : 'bg-[#1E1D1A] border-white/[0.08] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="w-6 h-6 rounded overflow-hidden grid grid-cols-2 shrink-0 border border-white/10">
                      <span style={{ backgroundColor: t.light }} />
                      <span style={{ backgroundColor: t.dark }} />
                      <span style={{ backgroundColor: t.dark }} />
                      <span style={{ backgroundColor: t.light }} />
                    </div>
                    <span className="text-xs font-medium truncate">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Taş Takımı</label>
            <div className="grid grid-cols-3 gap-2">
              {(['staunton', 'modern', 'classic'] as PieceSetId[]).map((ps) => (
                <button
                  key={ps}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, pieceSet: ps })}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    settings.pieceSet === ps
                      ? 'bg-[#81B64C]/20 border-[#81B64C]/60 text-[#BCE38A]'
                      : 'bg-[#1E1D1A] border-white/[0.08] text-slate-300 hover:border-white/20'
                  }`}
                >
                  {PIECE_SET_TR[ps]}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, soundEnabled: !settings.soundEnabled })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.05] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
            >
              {settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#81B64C]" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
              Ses Efektleri: {settings.soundEnabled ? 'Açık' : 'Kapalı'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-[#262522] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">Maç Geçmişi</h2>
        </div>

        {recentGames.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">
            Tamamlanan maçların burada otomatik olarak listelenir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1E1D1A] text-slate-400 border-b border-white/[0.06]">
                <tr>
                  <th className="px-4 py-3 font-medium">Karşılaşma</th>
                  <th className="px-4 py-3 font-medium">Açılış</th>
                  <th className="px-4 py-3 font-medium">Sonuç</th>
                  <th className="px-4 py-3 font-medium text-right">Hamle</th>
                  <th className="px-4 py-3 font-medium text-right">ELO</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-right">Motor</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {recentGames.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                      {g.whiteName} vs {g.blackName}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">
                      {g.openingName}
                    </td>
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                      {g.result} · {g.termination}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                      {g.moveCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                      {g.eloDelta >= 0 ? `+${g.eloDelta}` : g.eloDelta}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onAnalyzeGame(g)}
                          className="px-3 py-1 rounded bg-[#1E1D1A] hover:bg-[#81B64C]/20 border border-white/10 text-slate-200 font-medium cursor-pointer"
                        >
                          Analiz Et
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
