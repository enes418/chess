import type {
  AdminOverview,
  GameRecord,
  MatchChallengeItem,
  MultiplayerRoom,
  PlayerProfile,
  PublicFriend,
  SocialState,
  UserSettings,
} from '../types/chess';

export interface AuthSessionResponse {
  token: string;
  profile: PlayerProfile;
  settings: UserSettings;
  games: GameRecord[];
  cheatEngineAllowed?: boolean;
}

export interface AdminStatusResponse {
  configured: boolean;
  needsClaim: boolean;
  envOverride: boolean;
}

async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `İstek başarısız oldu (${res.status})`);
  }
  return data;
}

export async function registerSiteAccount(payload: {
  username: string;
  email: string;
  password: string;
  avatarUrl: string;
}): Promise<AuthSessionResponse> {
  return apiJson<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginSiteAccount(payload: {
  identifier: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiJson<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAdminStatus(): Promise<AdminStatusResponse> {
  return apiJson<AdminStatusResponse>('/api/admin/status');
}

export async function claimAdminAccount(payload: {
  username: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiJson<AuthSessionResponse>('/api/admin/claim', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginAdminAccount(payload: {
  username: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiJson<AuthSessionResponse>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAdminOverview(token: string): Promise<AdminOverview> {
  return apiJson<AdminOverview>('/api/admin/overview', {}, token);
}

export async function adminSetCheatEngine(
  token: string,
  enabled: boolean,
): Promise<{ cheatEngineAllowed: boolean }> {
  return apiJson<{ cheatEngineAllowed: boolean }>(
    '/api/admin/cheat-engine',
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
    token,
  );
}

export async function adminCloseRoom(token: string, roomCode: string): Promise<MultiplayerRoom> {
  const res = await apiJson<{ room: MultiplayerRoom }>(
    `/api/admin/rooms/${encodeURIComponent(roomCode)}/close`,
    { method: 'POST' },
    token,
  );
  return res.room;
}

export async function adminUpdatePlayerElo(
  token: string,
  uid: string,
  elo: number,
): Promise<PlayerProfile> {
  const res = await apiJson<{ profile: PlayerProfile }>(
    `/api/admin/players/${encodeURIComponent(uid)}/elo`,
    {
      method: 'PATCH',
      body: JSON.stringify({ elo }),
    },
    token,
  );
  return res.profile;
}

export async function adminDeleteGame(token: string, gameId: string): Promise<void> {
  await apiJson<{ deleted: boolean }>(
    `/api/admin/games/${encodeURIComponent(gameId)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function updateSiteProfile(
  token: string,
  updates: Partial<PlayerProfile>,
): Promise<PlayerProfile> {
  const res = await apiJson<{ profile: PlayerProfile }>(
    '/api/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    token,
  );
  return res.profile;
}

export async function updateSiteSettings(
  token: string,
  settings: UserSettings,
): Promise<UserSettings> {
  const res = await apiJson<{ settings: UserSettings }>(
    '/api/settings',
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    },
    token,
  );
  return res.settings;
}

export async function saveSiteGame(
  token: string,
  record: Omit<GameRecord, 'id' | 'createdAtMs'>,
): Promise<GameRecord> {
  const res = await apiJson<{ game: GameRecord }>(
    '/api/games',
    {
      method: 'POST',
      body: JSON.stringify(record),
    },
    token,
  );
  return res.game;
}

export async function createSiteRoom(
  token: string,
  hostColor: 'w' | 'b',
  timeControlSec: number,
  incrementSec: number,
): Promise<MultiplayerRoom> {
  const res = await apiJson<{ room: MultiplayerRoom }>(
    '/api/rooms',
    {
      method: 'POST',
      body: JSON.stringify({ hostColor, timeControlSec, incrementSec }),
    },
    token,
  );
  return res.room;
}

export async function joinSiteRoom(token: string, roomCode: string): Promise<MultiplayerRoom> {
  const res = await apiJson<{ room: MultiplayerRoom }>(
    `/api/rooms/${encodeURIComponent(roomCode)}/join`,
    { method: 'POST' },
    token,
  );
  return res.room;
}

export async function submitSiteRoomMove(
  token: string,
  roomCode: string,
  move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' },
): Promise<MultiplayerRoom> {
  const res = await apiJson<{ room: MultiplayerRoom }>(
    `/api/rooms/${encodeURIComponent(roomCode)}/move`,
    {
      method: 'POST',
      body: JSON.stringify(move),
    },
    token,
  );
  return res.room;
}

export async function finishSiteRoom(
  token: string,
  roomCode: string,
  winner: 'w' | 'b' | 'draw',
  termination: string,
): Promise<MultiplayerRoom> {
  const res = await apiJson<{ room: MultiplayerRoom }>(
    `/api/rooms/${encodeURIComponent(roomCode)}/finish`,
    {
      method: 'POST',
      body: JSON.stringify({ winner, termination }),
    },
    token,
  );
  return res.room;
}

export function subscribeSiteRoom(
  token: string,
  roomCode: string,
  onRoom: (room: MultiplayerRoom) => void,
  onError?: (err: string) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    apiJson<{ ticket: string }>(
      `/api/rooms/${encodeURIComponent(roomCode)}/ticket`,
      { method: 'POST' },
      token,
    )
      .then(({ ticket }) => {
        if (closed) return;
        source = new EventSource(
          `/api/rooms/${encodeURIComponent(roomCode)}/stream?ticket=${encodeURIComponent(ticket)}`,
        );
        source.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data) as MultiplayerRoom;
            onRoom(parsed);
          } catch {
            // Hatalı biçimli olay yoksayılır
          }
        };
        source.onerror = () => {
          source?.close();
          source = null;
          if (!closed) {
            onError?.('Bağlantı kesildi. Yeniden bağlanılıyor...');
            reconnectTimer = setTimeout(connect, 2500);
          }
        };
      })
      .catch((err) => {
        if (!closed) {
          onError?.(err instanceof Error ? err.message : 'Oda güncellemeleri alınamadı.');
        }
      });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    source?.close();
  };
}

// --- Friends & VS Challenge Social APIs ---

export async function getSocialState(token: string): Promise<SocialState> {
  return apiJson<SocialState>('/api/social/state', {}, token);
}

export async function searchPlayers(token: string, query: string): Promise<PublicFriend[]> {
  const res = await apiJson<{ players: PublicFriend[] }>(
    `/api/social/search?q=${encodeURIComponent(query)}`,
    {},
    token,
  );
  return res.players;
}

export async function sendFriendRequest(
  token: string,
  payload: { targetUid?: string; username?: string },
): Promise<{ status: string }> {
  return apiJson<{ status: string }>(
    '/api/friends/request',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function respondFriendRequest(
  token: string,
  requestId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  await apiJson<{ ok: boolean }>(
    '/api/friends/respond',
    {
      method: 'POST',
      body: JSON.stringify({ requestId, action }),
    },
    token,
  );
}

export async function removeFriend(token: string, friendUid: string): Promise<void> {
  await apiJson<{ ok: boolean }>(
    `/api/friends/${encodeURIComponent(friendUid)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function sendMatchChallenge(
  token: string,
  payload: {
    toUid: string;
    timeControlSec: number;
    incrementSec: number;
    challengerColor: 'w' | 'b' | 'random';
  },
): Promise<{ challenge: MatchChallengeItem }> {
  return apiJson<{ challenge: MatchChallengeItem }>(
    '/api/challenges',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function respondMatchChallenge(
  token: string,
  challengeId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<{ challenge: MatchChallengeItem; room?: MultiplayerRoom }> {
  return apiJson<{ challenge: MatchChallengeItem; room?: MultiplayerRoom }>(
    `/api/challenges/${encodeURIComponent(challengeId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
    token,
  );
}

export function subscribeSocialEvents(
  token: string,
  onSync: (state: SocialState) => void,
  onError?: (err: string) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    apiJson<{ ticket: string }>(
      '/api/social/ticket',
      { method: 'POST' },
      token,
    )
      .then(({ ticket }) => {
        if (closed) return;
        source = new EventSource(`/api/social/stream?ticket=${encodeURIComponent(ticket)}`);
        source.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data) as SocialState;
            onSync(parsed);
          } catch {
            // Hatalı biçimli olay yoksayılır
          }
        };
        source.onerror = () => {
          source?.close();
          source = null;
          if (!closed) {
            onError?.('Sosyal bildirim bağlantısı kesildi.');
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
      })
      .catch((err) => {
        if (!closed) {
          onError?.(err instanceof Error ? err.message : 'Sosyal bildirim akışı başlatılamadı.');
        }
      });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    source?.close();
  };
}
