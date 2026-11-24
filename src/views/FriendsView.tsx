import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  LogIn,
  Search,
  Swords,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { PublicFriend, SocialState } from '../types/chess';
import {
  removeFriend,
  respondFriendRequest,
  respondMatchChallenge,
  searchPlayers,
  sendFriendRequest,
  sendMatchChallenge,
} from '../services/localAuthApi';

interface FriendsViewProps {
  siteToken: string | null;
  socialState: SocialState;
  onRefreshSocial: () => Promise<void>;
  onEnterRoom: (roomCode: string) => void;
  onSignIn: () => void;
}

const CHALLENGE_TIMES = [
  { label: '3 + 2', sec: 180, inc: 2 },
  { label: '5 + 0', sec: 300, inc: 0 },
  { label: '10 + 0', sec: 600, inc: 0 },
  { label: '15 + 10', sec: 900, inc: 10 },
];

function formatChallengeTime(sec: number, inc: number): string {
  return `${Math.round(sec / 60)} + ${inc}`;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  siteToken,
  socialState,
  onRefreshSocial,
  onEnterRoom,
  onSignIn,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PublicFriend[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Arkadaş bazlı VS daveti ayarları
  const [inviteTimeByUid, setInviteTimeByUid] = useState<Record<string, number>>({});
  const [inviteColorByUid, setInviteColorByUid] = useState<Record<string, 'w' | 'b' | 'random'>>({});

  const runSearch = useCallback(
    async (query: string) => {
      if (!siteToken) return;
      setIsSearching(true);
      try {
        const players = await searchPlayers(siteToken, query);
        setSearchResults(players);
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'Oyuncu araması başarısız oldu.',
        });
      } finally {
        setIsSearching(false);
      }
    },
    [siteToken],
  );

  useEffect(() => {
    if (siteToken) {
      void runSearch('');
    }
  }, [runSearch, siteToken]);

  if (!siteToken) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl border border-white/[0.08] bg-[#262522] p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#81B64C]/20 border border-[#81B64C]/40 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6 text-[#95C95D]" />
        </div>
        <h1 className="text-xl font-bold text-white">Arkadaşlar ve Anlık VS Davetleri</h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          Oyuncu arayabilmek, arkadaş ekleyebilmek ve arkadaşlarına tek tıkla 1v1 VS daveti
          atabilmek için site içi hesabınla giriş yap veya kayıt ol.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[3px] border-[#5D8A32] text-white text-sm font-bold transition-colors cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          Kayıt Ol / Giriş Yap
        </button>
      </div>
    );
  }

  const friendUidSet = new Set(socialState.friends.map((f) => f.uid));
  const outgoingReqUidSet = new Set(socialState.outgoingRequests.map((r) => r.toUid));
  const incomingReqUidSet = new Set(socialState.incomingRequests.map((r) => r.fromUid));

  const handleAddFriend = async (target: PublicFriend) => {
    setBusyKey(`add:${target.uid}`);
    setFeedback(null);
    try {
      const res = await sendFriendRequest(siteToken, { targetUid: target.uid });
      await onRefreshSocial();
      setFeedback({
        type: 'ok',
        text:
          res.status === 'accepted'
            ? `${target.username} ile arkadaş oldunuz!`
            : `${target.username} adlı oyuncuya arkadaşlık isteği gönderildi.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Arkadaşlık isteği gönderilemedi.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRespondRequest = async (requestId: string, action: 'accept' | 'decline') => {
    setBusyKey(`req:${requestId}`);
    setFeedback(null);
    try {
      await respondFriendRequest(siteToken, requestId, action);
      await onRefreshSocial();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'İstek yanıtlanamadı.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveFriend = async (friend: PublicFriend) => {
    setBusyKey(`del:${friend.uid}`);
    setFeedback(null);
    try {
      await removeFriend(siteToken, friend.uid);
      await onRefreshSocial();
      setFeedback({ type: 'ok', text: `${friend.username} arkadaş listenden çıkarıldı.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Arkadaş çıkarılamadı.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleSendVsInvite = async (friend: PublicFriend) => {
    const tcIdx = inviteTimeByUid[friend.uid] ?? 2; // varsayılan 10+0
    const tc = CHALLENGE_TIMES[tcIdx] || CHALLENGE_TIMES[2];
    const color = inviteColorByUid[friend.uid] ?? 'random';

    setBusyKey(`vs:${friend.uid}`);
    setFeedback(null);
    try {
      await sendMatchChallenge(siteToken, {
        toUid: friend.uid,
        timeControlSec: tc.sec,
        incrementSec: tc.inc,
        challengerColor: color,
      });
      await onRefreshSocial();
      setFeedback({
        type: 'ok',
        text: `${friend.username} adlı arkadaşına ${tc.label} VS daveti gönderildi!`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'VS daveti gönderilemedi.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRespondChallenge = async (
    challengeId: string,
    action: 'accept' | 'decline' | 'cancel',
  ) => {
    setBusyKey(`ch:${challengeId}`);
    setFeedback(null);
    try {
      const res = await respondMatchChallenge(siteToken, challengeId, action);
      await onRefreshSocial();
      if (action === 'accept' && res.room?.roomCode) {
        onEnterRoom(res.room.roomCode);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'VS daveti işlenemedi.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.08] pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#81B64C]" />
            Arkadaşlar ve VS Davetleri
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Oyuncuları bul, arkadaş ekle ve tek tıkla 1v1 satranç düellosu başlat.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-[#81B64C]/40 bg-[#81B64C]/15 text-[#BCE38A]'
              : 'border-rose-500/35 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Gelen ve Giden VS Davetleri */}
      {(socialState.incomingChallenges.length > 0 || socialState.outgoingChallenges.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {socialState.incomingChallenges.length > 0 && (
            <div className="rounded-xl border border-[#81B64C]/45 bg-[#262522] p-4 space-y-3">
              <h2 className="text-sm font-bold text-[#95C95D] flex items-center gap-2">
                <Swords className="w-4 h-4" />
                Gelen VS Davetleri ({socialState.incomingChallenges.length})
              </h2>
              <div className="space-y-2.5">
                {socialState.incomingChallenges.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-lg bg-[#1E1D1A] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={ch.fromUser.avatarUrl}
                        alt={ch.fromUser.username}
                        className="w-9 h-9 rounded-lg object-cover border border-white/10"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {ch.fromUser.username}{' '}
                          <span className="font-mono text-slate-400 font-normal">
                            ({ch.fromUser.elo})
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Süre:{' '}
                          <span className="font-mono text-slate-200">
                            {formatChallengeTime(ch.timeControlSec, ch.incrementSec)}
                          </span>{' '}
                          · Rakip rengi:{' '}
                          {ch.challengerColor === 'w'
                            ? 'Beyaz'
                            : ch.challengerColor === 'b'
                              ? 'Siyah'
                              : 'Rastgele'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey === `ch:${ch.id}`}
                        onClick={() => void handleRespondChallenge(ch.id, 'accept')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] text-white text-xs font-bold cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Kabul Et
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === `ch:${ch.id}`}
                        onClick={() => void handleRespondChallenge(ch.id, 'decline')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#262522] hover:bg-rose-500/20 border border-white/10 text-xs font-medium text-slate-300 hover:text-rose-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {socialState.outgoingChallenges.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#262522] p-4 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Gönderilen VS Davetleri ({socialState.outgoingChallenges.length})
              </h2>
              <div className="space-y-2.5">
                {socialState.outgoingChallenges.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-lg bg-[#1E1D1A] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {ch.toUser.username} ·{' '}
                        <span className="font-mono text-slate-300">
                          {formatChallengeTime(ch.timeControlSec, ch.incrementSec)}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {ch.status === 'pending'
                          ? 'Arkadaşının yanıtı bekleniyor...'
                          : `Kabul edildi · Oda: ${ch.roomCode}`}
                      </p>
                    </div>

                    {ch.status === 'pending' ? (
                      <button
                        type="button"
                        disabled={busyKey === `ch:${ch.id}`}
                        onClick={() => void handleRespondChallenge(ch.id, 'cancel')}
                        className="px-3 py-1.5 rounded-lg bg-[#262522] hover:bg-rose-500/20 border border-white/10 text-xs font-medium text-slate-300 hover:text-rose-300 cursor-pointer"
                      >
                        İptal Et
                      </button>
                    ) : ch.roomCode ? (
                      <button
                        type="button"
                        onClick={() => onEnterRoom(ch.roomCode!)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-white text-xs font-bold cursor-pointer"
                      >
                        Maça Gir
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ana 2 Sütun: Arkadaşlarım & Oyuncu Ara */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sol: Arkadaş Listesi + VS Daveti Gönderme */}
        <div className="lg:col-span-7 space-y-4">
          {socialState.incomingRequests.length > 0 && (
            <div className="rounded-xl border border-amber-500/35 bg-[#262522] p-4 space-y-3">
              <h2 className="text-sm font-bold text-amber-200">
                Gelen Arkadaşlık İstekleri ({socialState.incomingRequests.length})
              </h2>
              <div className="space-y-2">
                {socialState.incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 rounded-lg bg-[#1E1D1A] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={req.fromUser.avatarUrl}
                        alt={req.fromUser.username}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {req.fromUser.username}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {req.fromUser.elo} ELO
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey === `req:${req.id}`}
                        onClick={() => void handleRespondRequest(req.id, 'accept')}
                        className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-white text-xs font-bold cursor-pointer"
                      >
                        Kabul Et
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === `req:${req.id}`}
                        onClick={() => void handleRespondRequest(req.id, 'decline')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#262522] hover:bg-white/[0.06] border border-white/10 text-xs text-slate-300 cursor-pointer"
                      >
                        Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/[0.08] bg-[#262522] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Arkadaşlarım ({socialState.friends.length})
              </h2>
              <span className="text-xs text-slate-400">Doğrudan 1v1 VS daveti at</span>
            </div>

            {socialState.friends.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm text-slate-300">Henüz arkadaş listen boş.</p>
                <p className="text-xs text-slate-400">
                  Sağ taraftan kullanıcı adıyla oyuncu arayıp arkadaş ekleyebilirsin.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {socialState.friends.map((friend) => {
                  const selectedTimeIdx = inviteTimeByUid[friend.uid] ?? 2;
                  const selectedCol = inviteColorByUid[friend.uid] ?? 'random';
                  return (
                    <div key={friend.uid} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={friend.avatarUrl}
                            alt={friend.username}
                            className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {friend.username}
                            </p>
                            <p className="text-xs font-mono tabular-nums text-slate-400">
                              {friend.elo} ELO · {friend.wins}G / {friend.losses}M / {friend.draws}B
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busyKey === `del:${friend.uid}`}
                          onClick={() => void handleRemoveFriend(friend)}
                          title="Arkadaşlıktan çıkar"
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          value={selectedTimeIdx}
                          onChange={(e) =>
                            setInviteTimeByUid((prev) => ({
                              ...prev,
                              [friend.uid]: Number(e.target.value),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                        >
                          {CHALLENGE_TIMES.map((tc, idx) => (
                            <option key={tc.label} value={idx}>
                              {tc.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedCol}
                          onChange={(e) =>
                            setInviteColorByUid((prev) => ({
                              ...prev,
                              [friend.uid]: e.target.value as 'w' | 'b' | 'random',
                            }))
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#1E1D1A] border border-white/10 text-xs text-white"
                        >
                          <option value="random">Renk: Rastgele</option>
                          <option value="w">Renk: Beyaz</option>
                          <option value="b">Renk: Siyah</option>
                        </select>

                        <button
                          type="button"
                          disabled={busyKey === `vs:${friend.uid}`}
                          onClick={() => void handleSendVsInvite(friend)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] border-b-[2px] border-[#5D8A32] disabled:opacity-50 text-white text-xs font-bold transition-colors ml-auto cursor-pointer whitespace-nowrap"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          VS Daveti At
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sağ: Oyuncu Arama & Arkadaş Ekleme */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#262522] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Oyuncu Ara &amp; Arkadaş Ekle</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kullanıcı adını yazarak kayıtlı oyuncuları bul.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(searchQuery);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kullanıcı adı ara..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-xs text-white placeholder:text-slate-600"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 rounded-lg bg-[#383632] hover:bg-[#45423D] border border-white/10 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              {isSearching ? 'Aranıyor...' : 'Ara'}
            </button>
          </form>

          <div className="divide-y divide-white/[0.05] max-h-96 overflow-y-auto rounded-lg bg-[#1E1D1A] border border-white/[0.06]">
            {searchResults.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">
                Eşleşen oyuncu bulunamadı.
              </p>
            ) : (
              searchResults.map((p) => {
                const isFriend = friendUidSet.has(p.uid);
                const isSent = outgoingReqUidSet.has(p.uid);
                const isIncoming = incomingReqUidSet.has(p.uid);

                return (
                  <div
                    key={p.uid}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={p.avatarUrl}
                        alt={p.username}
                        className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{p.username}</p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-400">
                          {p.elo} ELO
                        </p>
                      </div>
                    </div>

                    {isFriend ? (
                      <span className="text-[11px] font-semibold text-[#95C95D] px-2.5 py-1 rounded bg-[#81B64C]/15">
                        Arkadaş
                      </span>
                    ) : isSent ? (
                      <span className="text-[11px] text-slate-400 px-2.5 py-1 rounded bg-white/[0.04]">
                        İstek Gönderildi
                      </span>
                    ) : isIncoming ? (
                      <span className="text-[11px] text-amber-300 px-2.5 py-1 rounded bg-amber-500/15">
                        İstek Bekliyor
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyKey === `add:${p.uid}`}
                        onClick={() => void handleAddFriend(p)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#95C95D] text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Ekle
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
