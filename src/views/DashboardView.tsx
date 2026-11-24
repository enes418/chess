import React from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Cpu,
  Crown,
  Flame,
  Puzzle,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  AppSection,
  GameRecord,
  PlayerProfile,
  PlaySubMode,
} from '../types/chess';
import { getDailyPuzzle } from '../data/puzzles';

interface DashboardViewProps {
  profile: PlayerProfile | null;
  recentGames: GameRecord[];
  isAdmin?: boolean;
  onNavigate: (section: AppSection, playSubMode?: PlaySubMode) => void;
  onAnalyzeGame: (game: GameRecord) => void;
}

const PUZZLE_DIFF_TR: Record<string, string> = {
  Easy: 'Kolay',
  Medium: 'Orta',
  Hard: 'Zor',
  Master: 'Usta',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  recentGames,
  isAdmin = false,
  onNavigate,
  onAnalyzeGame,
}) => {
  const dailyPuzzle = getDailyPuzzle();
  const gamesPlayed = profile?.gamesPlayed ?? recentGames.length;
  const wins =
    profile?.wins ??
    recentGames.filter((g) =>
      g.playerColor === 'w' ? g.result === '1-0' : g.result === '0-1',
    ).length;
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Ana Ekran Karşılama & Maça Giriş Alanı (Satranç Tahtası Yok) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#262522] min-h-[320px] flex flex-col justify-end p-6 sm:p-8">
          <img
            src="/src/assets/images/hero_chess_arena_1795539266864.jpg"
            alt="Chess Arena turnuva salonu"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E1D1A] via-[#1E1D1A]/80 to-[#1E1D1A]/25" />

          <div className="relative z-10 max-w-xl space-y-4">
            <p className="text-xs font-medium tracking-wide text-[#95C95D]">
              Çevrimiçi Odalar · Arkadaşlarla VS · Pro Yapay Zekâ Motoru
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
              Arenaya Hazır Ol, Hamleni Yap.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Oyun modunu seçip masaya otur: arkadaşlarınla gerçek zamanlı özel odalarda yarış, Başlangıçtan Usta seviyesine kadar akıllı yapay zekâ botlarına meydan oku.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('play', 'ai')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                Maça Gir
              </button>
              <button
                type="button"
                onClick={() => onNavigate('play', 'online')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Flame className="w-4 h-4 text-[#95C95D]" />
                Çevrimiçi Oda
              </button>
              <button
                type="button"
                onClick={() => onNavigate('friends')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Users className="w-4 h-4 text-amber-400" />
                Arkadaşa VS At
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate('analysis')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-200 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Motor Stüdyosu
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sağ Lobi Paneli: Hızlı Maç Seçenekleri & Günün Taktik Görevi */}
        <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#262522] p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Hızlı Oyun Başlat</h2>
              <span className="text-xs font-mono text-slate-400">
                {profile?.elo ?? 1200} ELO
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('play', 'ai')}
                className="p-3.5 rounded-xl bg-[#1E1D1A] hover:bg-[#32302B] border border-white/[0.07] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">Bilgisayara Karşı</p>
                <p className="text-xs text-slate-400 mt-0.5">6 zorluk · 600–2600 ELO</p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('play', 'online')}
                className="p-3.5 rounded-xl bg-[#1E1D1A] hover:bg-[#32302B] border border-white/[0.07] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <Swords className="w-4 h-4 text-[#95C95D]" />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">Özel Oda Kur</p>
                <p className="text-xs text-slate-400 mt-0.5">Kodu paylaş, anında oyna</p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('play', 'local')}
                className="p-3.5 rounded-xl bg-[#1E1D1A] hover:bg-[#32302B] border border-white/[0.07] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <Users className="w-4 h-4 text-sky-400" />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">Aynı Cihazda VS</p>
                <p className="text-xs text-slate-400 mt-0.5">2 kişilik yüz yüze maç</p>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('openings')}
                className="p-3.5 rounded-xl bg-[#1E1D1A] hover:bg-[#32302B] border border-white/[0.07] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">Açılış Çalış</p>
                <p className="text-xs text-slate-400 mt-0.5">Klasik ve modern sistemler</p>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-400">
                Günün Bulmacası · {PUZZLE_DIFF_TR[dailyPuzzle.difficulty] || dailyPuzzle.difficulty} ·{' '}
                {dailyPuzzle.rating}
              </p>
              <p className="text-sm font-semibold text-white truncate mt-0.5">{dailyPuzzle.title}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('puzzles')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#383632] hover:bg-[#81B64C] border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Puzzle className="w-3.5 h-3.5" />
              Çöz
            </button>
          </div>
        </div>
      </section>

      {/* Oyuncu İstatistikleri */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Satranç Puanı</span>
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white">
            {profile?.elo ?? 1200}
          </p>
          <p className="mt-1 text-xs text-slate-400">Hızlı &amp; Klasik</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Kazanma Oranı</span>
            <Trophy className="w-4 h-4 text-[#81B64C]" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-mono font-bold tabular-nums text-[#95C95D]">
            %{winRate}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {wins}G · {profile?.losses ?? 0}M · {profile?.draws ?? 0}B
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Oynanan Maç</span>
            <Swords className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white">
            {gamesPlayed}
          </p>
          <p className="mt-1 text-xs text-slate-400">Tüm oyun modları</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Bulmaca Puanı</span>
            <Puzzle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-mono font-bold tabular-nums text-white">
            {profile?.puzzleRating ?? 1200}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {profile?.solvedPuzzleIds?.length ?? 0} çözüldü
          </p>
        </div>
      </section>

      {/* Son Maçlar ve Arena Bölümleri */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-white/[0.08] bg-[#262522] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Son Maçlar</h2>
              <p className="text-xs text-slate-400">
                Bilgisayara karşı ve özel odalarda tamamlanan karşılaşmalar
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs font-semibold text-[#95C95D] hover:text-[#BCE38A] transition-colors cursor-pointer"
            >
              Tümünü Gör
            </button>
          </div>

          {recentGames.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">Henüz tamamlanmış bir maç kaydı yok.</p>
              <p className="text-xs text-slate-400">
                Arşivini başlatmak için maça gir veya bir arkadaşına VS daveti gönder.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('play', 'ai')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                İlk Maçı Başlat
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {recentGames.slice(0, 6).map((game) => {
                const playerWon =
                  (game.playerColor === 'w' && game.result === '1-0') ||
                  (game.playerColor === 'b' && game.result === '0-1');
                const isDraw = game.result === '1/2-1/2';
                const outcomeText = isDraw ? 'Berabere' : playerWon ? 'Galibiyet' : 'Mağlubiyet';
                const outcomeColor = isDraw
                  ? 'text-slate-300'
                  : playerWon
                    ? 'text-[#95C95D]'
                    : 'text-rose-400';

                return (
                  <div
                    key={game.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className="truncate">
                          {game.whiteName} vs {game.blackName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {game.openingName} · {game.termination} · {game.moveCount} hamle
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${outcomeColor}`}>
                          {outcomeText} ({game.result})
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-400">
                          {game.eloDelta >= 0 ? `+${game.eloDelta}` : game.eloDelta} ELO
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onAnalyzeGame(game)}
                          className="px-3 py-1.5 rounded-lg bg-[#1E1D1A] hover:bg-[#81B64C]/20 border border-white/10 hover:border-[#81B64C]/40 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Analiz Et
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sağ Menü: Eğitim & Yönetim */}
        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-3">
          <h2 className="text-base font-semibold text-white">Oyna ve Öğren</h2>
          <p className="text-xs text-slate-400 pb-1">
            Bir oyun modu veya eğitim bölümü seç
          </p>

          <button
            type="button"
            onClick={() => onNavigate('friends')}
            className="w-full p-3 rounded-lg bg-[#1E1D1A] hover:bg-[#35332E] border border-white/[0.06] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-[#81B64C] shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Arkadaşlar &amp; VS</p>
                <p className="text-xs text-slate-400">Arkadaş ekle, anlık düello daveti at</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('puzzles')}
            className="w-full p-3 rounded-lg bg-[#1E1D1A] hover:bg-[#35332E] border border-white/[0.06] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Puzzle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Taktik Bulmacalar</p>
                <p className="text-xs text-slate-400">Mat kombinasyonları ve taktik çalışma</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('play', 'practice')}
            className="w-full p-3 rounded-lg bg-[#1E1D1A] hover:bg-[#35332E] border border-white/[0.06] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Serbest Tahta</p>
                <p className="text-xs text-slate-400">Özel FEN konumu &amp; antrenman</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="w-full p-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-200">Admin Kontrol Paneli</p>
                  <p className="text-xs text-amber-300/75">Pro Hile Motoru &amp; Oyuncu Yönetimi</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
