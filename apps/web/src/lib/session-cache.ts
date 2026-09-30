type SessionPayload = {
  user: { id: string; email: string; name: string };
  session: { id: string; userId: string };
};

type CacheEntry = {
  at: number;
  data: SessionPayload | null;
};

const TTL_MS = 30_000;
let cache: CacheEntry | null = null;

export function clearSessionCache(): void {
  cache = null;
}

export async function getCachedSession(
  getSession: () => Promise<{ data: SessionPayload | null }>,
): Promise<SessionPayload | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return cache.data;
  }
  const result = await getSession();
  cache = { at: now, data: result.data };
  return result.data;
}
