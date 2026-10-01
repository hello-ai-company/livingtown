import { createServer } from 'node:http';
import { createAssistant } from './assistant.mjs';
import { pathToFileURL } from 'node:url';
const publicErrors = {
  PAID_PROVIDER_LOCKED: [503, 'この版はfake専用です。有料接続はコードで無効化されています。'],
  USER_CALL_LIMIT: [429, 'この利用者の質問回数上限（3回）に達しました。'],
  INVALID_INPUT: [400, '質問リクエストの形式が不正です。'],
  CONFIG_REQUIRED: [503, 'AI設定が不足しています。ローカルでは ASSISTANT_PROVIDER=fake で起動してください。'],
  CALL_LIMIT: [429, 'このプロセスの質問回数上限（20回）に達しました。'],
};
export function createApp(ask, env = process.env) {
  const assistant = ask ?? createAssistant({ env });
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/healthz') return res.end('{"status":"ok"}');
    if (req.method !== 'POST' || req.url !== '/api/training/questions') { res.writeHead(404); return res.end('{}'); }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      // Hard release gate: authentication + durable quotas are not implemented.
      // Environment variables, gateway headers and secrets cannot enable paid AI.
      if ((env.ASSISTANT_PROVIDER || 'fake') !== 'fake') throw new Error('PAID_PROVIDER_LOCKED');
      const userId = 'local-demo';
      if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('INVALID_INPUT');
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 2048) throw new Error('INVALID_INPUT');
      }
      let input;
      try { input = JSON.parse(body); } catch { throw new Error('INVALID_INPUT'); }
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
  const port = Number(process.env.PORT || 8080);
  createApp().listen(port, process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () => console.log(`Training assistant listening on port ${port}`));
}
