import { createServer } from 'node:http';
import { createAssistant, validateInput } from './assistant.mjs';
import { allowedOrigin } from './security.mjs';
import { pathToFileURL } from 'node:url';
import { configureRuntime } from './runtime.mjs';
const publicErrors = {
  PAID_PROVIDER_LOCKED: [503, 'この版はfake専用です。有料接続はコードで無効化されています。'],
  USER_CALL_LIMIT: [429, 'この利用者の質問回数上限（3回）に達しました。'],
  AUTH_REQUIRED: [401, '許可された非匿名ユーザーのログインが必要です。'],
  AUTH_UNAVAILABLE: [503, '認証を確認できません。処理は実行していません。'],
  QUOTA_UNAVAILABLE: [503, '永続的な利用上限を確認できません。処理は実行していません。'],
  DUPLICATE_REQUEST: [409, 'この要求は受付済みです。再実行しません。'],
  ORIGIN_DENIED: [403, 'この画面からの接続は許可されていません。'],
  INVALID_INPUT: [400, '質問リクエストの形式が不正です。'],
  CONFIG_REQUIRED: [503, 'AI設定が不足しています。ローカルでは ASSISTANT_PROVIDER=fake で起動してください。'],
  CALL_LIMIT: [429, '質問回数の全体上限（20回）に達しました。'],
};
export function createApp(ask, env = process.env, { authenticate, reserve } = {}) {
  const assistant = ask ?? createAssistant({ env });
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/healthz') return res.end('{"status":"ok"}');
    if (!['POST', 'OPTIONS'].includes(req.method) || req.url !== '/api/training/questions') { res.writeHead(404); return res.end('{}'); }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const mode = env.TRAINING_SECURITY_MODE || 'local';
      if (!['local', 'verified'].includes(mode) || (env.K_SERVICE && mode !== 'verified')) throw new Error('CONFIG_REQUIRED');
      const origin = req.headers.origin;
      if (origin) {
        // Local Vite proxy keeps its own origin; local mode only accepts exact loopback
        // origins, never a random website or a caller-controlled Host header.
        const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
        if (!(mode === 'local' ? localOrigin : allowedOrigin(origin, env.TRAINING_ALLOWED_ORIGINS))) throw new Error('ORIGIN_DENIED');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (!origin || req.headers['access-control-request-method'] !== 'POST' || headers.some(h => !['authorization', 'content-type'].includes(h))) throw new Error('ORIGIN_DENIED');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.writeHead(204); return res.end();
      }
      // Hard release gate remains: preparation/mock tests cannot enable paid AI.
      if ((env.ASSISTANT_PROVIDER || 'fake') !== 'fake') throw new Error('PAID_PROVIDER_LOCKED');
      if (mode === 'verified' && (typeof authenticate !== 'function' || typeof reserve !== 'function')) throw new Error('CONFIG_REQUIRED');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('INVALID_INPUT');
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 2048) throw new Error('INVALID_INPUT');
      }
      let input;
      try { input = JSON.parse(body); } catch { throw new Error('INVALID_INPUT'); }
      validateInput(input);
      const userId = mode === 'verified' ? await authenticate(req.headers.authorization, controller.signal) : 'local-demo';
      if (mode === 'verified') await reserve(userId, input.request_id, controller.signal);
      controller.signal.throwIfAborted();
      const result = await assistant(input, controller.signal, userId);
      if (!res.destroyed) res.end(JSON.stringify(result));
    } catch (error) {
      if (res.destroyed) return;
      const [code, message] = publicErrors[error.message] || [502, '質問を取得できませんでした。中断・接続・AI応答を確認して再試行してください。'];
      res.writeHead(code);
      res.end(JSON.stringify({ error: message }));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const runtime = await configureRuntime(process.env);
    const port = Number(process.env.PORT || 8080);
    const server = createApp(undefined, process.env, runtime);
    server.on('error', () => { console.error('Training assistant could not listen.'); void runtime.close(); process.exitCode = 1; });
    server.listen(port, process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () => console.log(`Training assistant listening on port ${port}`));
    process.once('SIGTERM', () => {
      server.close(() => { void runtime.close(); });
      setTimeout(() => process.exit(0), 5000).unref();
    });
  } catch {
    console.error('Training assistant startup refused. Check server-only auth, quota and provider configuration.');
    process.exitCode = 1;
  }
}
