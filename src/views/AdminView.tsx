import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  Check,
  Cpu,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import type { AdminOverview } from '../types/chess';
import {
  adminCloseRoom,
  adminDeleteGame,
  adminSetCheatEngine,
  adminUpdatePlayerElo,
  getAdminOverview,
} from '../services/localAuthApi';

interface AdminViewProps {
  siteToken: string | null;
  cheatEngineAllowed?: boolean;
  onCheatEngineChanged?: (enabled: boolean) => void;
}

const ROOM_STATUS_TR: Record<string, string> = {
  active: 'Aktif',
  waiting: 'Bekliyor',
  finished: 'Tamamlandı',
};

export const AdminView: React.FC<AdminViewProps> = ({
  siteToken,
  cheatEngineAllowed = true,
  onCheatEngineChanged,
}) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [eloDrafts, setEloDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedUid, setSavedUid] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!siteToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminOverview(siteToken);
      setOverview(data);
      if (typeof data.cheatEngineAllowed === 'boolean') {
        onCheatEngineChanged?.(data.cheatEngineAllowed);
      }
      const drafts: Record<string, string> = {};
      for (const p of data.players) {
        drafts[p.uid] = String(p.elo);
      }
      setEloDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [onCheatEngineChanged, siteToken]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleToggleCheatEngine = async () => {
    if (!siteToken) return;
    const current = overview?.cheatEngineAllowed ?? cheatEngineAllowed;
    const next = !current;
    setBusyId('cheat-toggle');
    setError(null);
    try {
      const res = await adminSetCheatEngine(siteToken, next);
      setOverview((prev) =>
        prev ? { ...prev, cheatEngineAllowed: res.cheatEngineAllowed } : prev,
      );
      onCheatEngineChanged?.(res.cheatEngineAllowed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hile motoru durumu değiştirilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveElo = async (uid: string) => {
    if (!siteToken) return;
    const numeric = Number(eloDrafts[uid]);
    if (!Number.isFinite(numeric)) {
      setError('100 ile 3500 arasında geçerli bir ELO puanı girin.');
      return;
    }
    setBusyId(`elo:${uid}`);
    setError(null);
    try {
      const updated = await adminUpdatePlayerElo(siteToken, uid, numeric);
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) => (p.uid === uid ? updated : p)),
            }
          : prev,
      );
      setEloDrafts((prev) => ({ ...prev, [uid]: String(updated.elo) }));
      setSavedUid(uid);
      setTimeout(() => setSavedUid((curr) => (curr === uid ? null : curr)), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ELO güncellenemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseRoom = async (roomCode: string) => {
    if (!siteToken) return;
    setBusyId(`room:${roomCode}`);
    setError(null);
    try {
      const updatedRoom = await adminCloseRoom(siteToken, roomCode);
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              rooms: prev.rooms.map((r) => (r.roomCode === roomCode ? updatedRoom : r)),
              activeRoomsCount: prev.rooms.filter(
                (r) => (r.roomCode === roomCode ? updatedRoom.status : r.status) !== 'finished',
              ).length,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oda kapatılamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!siteToken) return;
    setBusyId(`game:${gameId}`);
    setError(null);
    try {
      await adminDeleteGame(siteToken, gameId);
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              totalGames: Math.max(0, prev.totalGames - 1),
              recentGames: prev.recentGames.filter((g) => g.id !== gameId),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maç kaydı silinemedi.');
    } finally {
      setBusyId(null);
    }
  };

  if (!siteToken) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#262522] p-8 text-center text-sm text-slate-400">
        Admin Paneline erişmek için yönetici hesabıyla giriş yapın.
      </div>
    );
  }

  const engineEnabled = overview?.cheatEngineAllowed ?? cheatEngineAllowed;

  return (
    <div className="space-y-8">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            Admin Kontrol Paneli
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Satranç hile motoru kontrolü · Oyuncu ELO yönetimi · Aktif odalar ve maç arşivi
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#262522] hover:bg-[#363430] border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Verileri Yenile
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Admin Satranç Hile Motoru Ana Açma/Kapama Kartı */}
      <div className="rounded-2xl border border-amber-500/35 bg-[#262522] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Satranç Hile Motoru (Admin Özel)</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {engineEnabled
                ? 'Pro Hile Motoru şu anda AÇIK. Oyun ekranında tek okla en iyi hamle, taktik analiz, değerlendirme çubuğu ve tek tıkla oynama kullanılabilir.'
                : 'Pro Hile Motoru şu anda KAPALI. Oyun ekranındaki canlı hamle yardımcısı devre dışı bırakıldı.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={busyId === 'cheat-toggle'}
          onClick={() => void handleToggleCheatEngine()}
          className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            engineEnabled
              ? 'bg-amber-500 hover:bg-amber-400 text-[#1E1D1A]'
              : 'bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] text-white'
          }`}
        >
          {engineEnabled ? 'Hile Motoru: AÇIK (Kapat)' : 'Hile Motoru: KAPALI (Aç)'}
        </button>
      </div>

      {/* Özet Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Users className="w-4 h-4 text-emerald-400" />
            Kayıtlı Hesaplar
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white mt-2">
            {overview?.totalUsers ?? '—'}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Activity className="w-4 h-4 text-amber-400" />
            Aktif Odalar
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white mt-2">
            {overview?.activeRoomsCount ?? '—'}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Trophy className="w-4 h-4 text-emerald-400" />
            Kayıtlı Maçlar
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white mt-2">
            {overview?.totalGames ?? '—'}
          </div>
        </div>
      </div>

      {loading && !overview ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#262522] p-12 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          Platform verileri yükleniyor...
        </div>
      ) : overview ? (
        <>
          {/* Oyuncular Tablosu */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#262522] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Kayıtlı Oyuncular ve ELO</h2>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Toplam {overview.players.length}
              </span>
            </div>

            {overview.players.length === 0 ? (
              <div className="p-6 text-xs text-slate-400">Henüz kayıtlı hesap bulunmuyor.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1E1D1A]/60 text-slate-400 border-b border-white/[0.06]">
                    <tr>
                      <th className="py-3 px-4 font-medium">Oyuncu</th>
                      <th className="py-3 px-4 font-medium">Rol</th>
                      <th className="py-3 px-4 font-medium">Skor (G/M/B)</th>
                      <th className="py-3 px-4 font-medium">Bulmaca Puanı</th>
                      <th className="py-3 px-4 font-medium">ELO Düzenle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {overview.players.map((player) => (
                      <tr key={player.uid} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={player.avatarUrl}
                              alt={player.username}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-lg object-cover border border-white/10"
                            />
                            <div>
                              <div className="font-semibold text-white">{player.username}</div>
                              <div className="text-[11px] font-mono text-slate-500">{player.uid}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-semibold ${
                              player.role === 'admin' ? 'text-amber-400' : 'text-slate-300'
                            }`}
                          >
                            {player.role === 'admin' ? 'Admin' : 'Oyuncu'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
                          {player.wins}G · {player.losses}M · {player.draws}B
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
                          {player.puzzleRating}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={100}
                              max={3500}
                              value={eloDrafts[player.uid] ?? String(player.elo)}
                              onChange={(e) =>
                                setEloDrafts((prev) => ({ ...prev, [player.uid]: e.target.value }))
                              }
                              className="w-24 px-2.5 py-1.5 rounded-md bg-[#1E1D1A] border border-white/10 focus:border-emerald-500/60 outline-none font-mono tabular-nums text-white"
                            />
                            <button
                              type="button"
                              disabled={busyId === `elo:${player.uid}`}
                              onClick={() => void handleSaveElo(player.uid)}
                              className="px-3 py-1.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/30 text-emerald-300 font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              {savedUid === player.uid ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  Kaydedildi
                                </>
                              ) : (
                                'Kaydet'
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Odalar ve Maçlar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-white/[0.08] bg-[#262522] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Çevrimiçi Odalar</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {overview.rooms.length} oda
                </span>
              </div>

              {overview.rooms.length === 0 ? (
                <div className="p-6 text-xs text-slate-400">Henüz oda oluşturulmadı.</div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {overview.rooms.map((room) => (
                    <div
                      key={room.roomCode}
                      className="px-5 py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-white">{room.roomCode}</span>
                          <span className="text-slate-500">·</span>
                          <span
                            className={
                              room.status === 'active'
                                ? 'text-emerald-400 font-medium'
                                : room.status === 'waiting'
                                  ? 'text-amber-400 font-medium'
                                  : 'text-slate-400'
                            }
                          >
                            {ROOM_STATUS_TR[room.status] || room.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {room.hostName} vs {room.guestName || 'Rakip bekleniyor'}
                          {room.termination ? ` · ${room.termination}` : ''}
                        </div>
                      </div>

                      {room.status !== 'finished' && (
                        <button
                          type="button"
                          disabled={busyId === `room:${room.roomCode}`}
                          onClick={() => void handleCloseRoom(room.roomCode)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Odayı Kapat
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#262522] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Son Platform Maçları</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {overview.recentGames.length} kayıt
                </span>
              </div>

              {overview.recentGames.length === 0 ? (
                <div className="p-6 text-xs text-slate-400">Henüz kayıtlı maç yok.</div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {overview.recentGames.map((game) => (
                    <div
                      key={game.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {game.whiteName} vs {game.blackName}{' '}
                          <span className="font-mono text-emerald-400 ml-1">{game.result}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {game.openingName} · {game.termination} ·{' '}
                          <span className="font-mono tabular-nums">{game.moveCount} hamle</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyId === `game:${game.id}`}
                        onClick={() => void handleDeleteGame(game.id)}
                        aria-label={`Maçı sil ${game.id}`}
                        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};
