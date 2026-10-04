import { createVerifiedIdentity, createQuotaReservation, allowedOrigin } from './security.mjs';

export function databaseConfig(env) {
  const ref = /^https:\/\/([a-z0-9-]+)\.supabase\.co$/.exec(env.TRAINING_AUTH_ORIGIN || '')?.[1];
  const direct = ref && env.TRAINING_DB_HOST === `db.${ref}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(env.TRAINING_DB_HOST || '');
  if (!ref || (!direct && !pooler) ||
      env.TRAINING_DB_USER !== (direct ? 'training_executor' : `training_executor.${ref}`) ||
      !env.TRAINING_DB_PASSWORD || env.TRAINING_DB_PORT !== '5432') throw Error('CONFIG_REQUIRED');
  return {
    host: env.TRAINING_DB_HOST, port: 5432, database: 'postgres', user: env.TRAINING_DB_USER,
    password: env.TRAINING_DB_PASSWORD, ssl: { rejectUnauthorized: true, ...(env.TRAINING_DB_CA ? { ca: env.TRAINING_DB_CA } : {}) },
    max: 2, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
    statement_timeout: 3000, query_timeout: 4000, lock_timeout: 2000,
    idle_in_transaction_session_timeout: 3000, application_name: 'livingtown-training',
  };
}

// Connecting to Auth/DB is an explicit deployment-time opt-in. Tests inject transports;
// production reads secrets only on the server. Vertex remains hard-locked elsewhere.
export async function configureRuntime(env, { fetcher = fetch, PoolClass } = {}) {
  if ((env.ASSISTANT_PROVIDER || 'fake') !== 'fake') throw Error('PAID_PROVIDER_LOCKED');
  const mode = env.TRAINING_SECURITY_MODE || 'local';
  if (mode === 'local' && !env.K_SERVICE) return { close: async () => {} };
  if (mode !== 'verified' || env.TRAINING_ALLOW_EXTERNAL_IO !== 'true') throw Error('CONFIG_REQUIRED');
  const origins = (env.TRAINING_ALLOWED_ORIGINS || '').split(',').map(v => v.trim());
  if (!origins.length || origins.some(origin => !allowedOrigin(origin, origin))) throw Error('CONFIG_REQUIRED');
  const authenticate = createVerifiedIdentity({
    authOrigin: env.TRAINING_AUTH_ORIGIN, publicKey: env.TRAINING_AUTH_PUBLIC_KEY,
    allowedUsers: (env.TRAINING_ALLOWED_USERS || '').split(',').map(v => v.trim()), fetcher,
  });
  const config = databaseConfig(env);
  const Pool = PoolClass || (await import('pg')).Pool;
  const pool = new Pool(config);
  // Never log pg errors: they can contain connection credentials, query arguments or IDs.
  pool.on('error', () => {});
  try {
    const ready = await pool.query(`select current_user as actor,
      has_function_privilege(current_user, 'training_private.reserve_question(uuid,text)', 'execute') as permitted,
      (select count(*) = 1 from training_private.budget) as initialized`);
    if (ready.rows?.[0]?.actor !== 'training_executor' || ready.rows[0].permitted !== true || ready.rows[0].initialized !== true) throw Error('CONFIG_REQUIRED');
  } catch {
    await pool.end().catch(() => {});
    throw Error('QUOTA_UNAVAILABLE');
  }
  return { authenticate, reserve: createQuotaReservation((sql, args) => pool.query(sql, args)), close: () => pool.end() };
}
