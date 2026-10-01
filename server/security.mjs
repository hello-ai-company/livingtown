// Preparation only: no default transport, no remote calls from environment settings.
// Auth identity must come from the configured Auth server, never decoded client claims.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createVerifiedIdentity({ authOrigin, publicKey, allowedUsers, fetcher } = {}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(authOrigin || '') ||
      !publicKey || typeof fetcher !== 'function' || !Array.isArray(allowedUsers) ||
      !allowedUsers.length || allowedUsers.length > 20 || allowedUsers.some(id => !uuid.test(id))) {
    throw new Error('CONFIG_REQUIRED');
  }
  const allowed = new Set(allowedUsers);
  return async (authorization, signal) => {
    if (typeof authorization !== 'string' || authorization.length > 8192 ||
        !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) throw new Error('AUTH_REQUIRED');
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetcher(`${authOrigin}/auth/v1/user`, {
        headers: { apikey: publicKey, Authorization: authorization },
        redirect: 'error', signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(5000)]),
      });
    } catch { throw new Error('AUTH_UNAVAILABLE'); }
    if (response.status === 401 || response.status === 403) throw new Error('AUTH_REQUIRED');
    if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
    let user;
    try { user = await response.json(); } catch { throw new Error('AUTH_UNAVAILABLE'); }
    // Anonymous sign-in has the authenticated role too. Require explicit non-anonymous
    // status and a server-maintained invite list; metadata/email/client user IDs are ignored.
    if (!user || !uuid.test(user.id) || user.is_anonymous !== false || !allowed.has(user.id)) {
      throw new Error('AUTH_REQUIRED');
    }
    signal?.throwIfAborted();
    return user.id;
  };
}

// query must execute against ONE shared PostgreSQL primary. A successful result means
// the reservation transaction committed. Lost responses/errors are never retried/refunded.
export function createQuotaReservation(query) {
  if (typeof query !== 'function') throw new Error('CONFIG_REQUIRED');
  return async (userId, requestId, signal) => {
    signal?.throwIfAborted();
    if (!uuid.test(userId) || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw new Error('INVALID_INPUT');
    let result;
    try {
      const deadline = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(5000)]);
      let onAbort;
      try {
        result = await Promise.race([
          query('select training_private.reserve_question($1::uuid, $2::text) as decision', [userId, requestId]),
          new Promise((_resolve, reject) => {
            onAbort = () => reject(new Error('QUOTA_UNAVAILABLE'));
            deadline.addEventListener('abort', onAbort, { once: true });
            if (deadline.aborted) onAbort();
          }),
        ]);
      } finally { if (onAbort) deadline.removeEventListener('abort', onAbort); }
    } catch { throw new Error('QUOTA_UNAVAILABLE'); }
    // Do not race a timeout and refund: a timed-out query may already have committed.
    signal?.throwIfAborted();
    const decision = result?.rows?.[0]?.decision;
    if (!['reserved', 'duplicate', 'user_limit', 'global_limit'].includes(decision)) throw new Error('QUOTA_UNAVAILABLE');
    if (decision === 'duplicate') throw new Error('DUPLICATE_REQUEST');
    if (decision === 'user_limit') throw new Error('USER_CALL_LIMIT');
    if (decision === 'global_limit') throw new Error('CALL_LIMIT');
  };
}

export function allowedOrigin(origin, configured) {
  if (!origin || !configured) return false;
  // Exact origins only: no wildcard preview domains, null origin, paths or credentials.
  return configured.split(',').some(value => {
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && url.origin === value.trim() && origin === url.origin;
    } catch { return false; }
  });
}
