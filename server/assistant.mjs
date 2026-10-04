// Only question ordering crosses the model boundary. No household/location data,
// route tools, database credentials or resident verification tools are exposed.
export const FIELDS = ['household_id', 'scenario', 'weather', 'time_of_day'];
// Prepared for the currently documented stable candidate, mock transport only.
// Runtime/HTTP release locks still reject every real paid provider.
export function thinkingConfig(model) {
  return model === 'gemini-3.1-flash-lite' ? { thinkingLevel: 'MINIMAL', includeThoughts: false } : undefined;
}
export function validateInput(input) {
  if (!input || Object.keys(input).sort().join() !== 'action,request_id' || input.action !== 'questions' ||
      typeof input.request_id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(input.request_id)) throw new Error('INVALID_INPUT');
}
export function validateQuestions(value) {
  if (!value || Object.keys(value).join() !== 'fields' || !Array.isArray(value.fields) ||
      value.fields.length !== FIELDS.length || new Set(value.fields).size !== FIELDS.length ||
      value.fields.some(field => !FIELDS.includes(field))) throw new Error('INVALID_MODEL_OUTPUT');
  return value.fields;
}
export function createAssistant({ env = process.env, fetcher, maxCalls = 20, maxUserCalls = 3 } = {}) {
  const requests = new Map();
  const users = new Map();
  let calls = 0;
  return async function ask(input, signal, userId = 'local-demo') {
    validateInput(input);
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(userId)) throw new Error('INVALID_INPUT');
    signal?.throwIfAborted();
    const key = `${userId}:${input.request_id}`;
    if (requests.has(key)) return requests.get(key);
    if ((users.get(userId) || 0) >= maxUserCalls) throw new Error('USER_CALL_LIMIT');
    if (calls >= maxCalls) throw new Error('CALL_LIMIT');
    const provider = env.ASSISTANT_PROVIDER || 'fake';
    if (!['fake', 'vertex'].includes(provider)) throw new Error('CONFIG_REQUIRED');
    // No default network transport: Vertex protocol code is mock-test-only.
    // An explicit code change and reviewed auth/quota infrastructure are required for live use.
    if (provider === 'vertex' && typeof fetcher !== 'function') throw new Error('PAID_PROVIDER_LOCKED');
    if (provider === 'vertex' && (env.ALLOW_PAID_AI !== 'true' ||
        !/^[a-z][a-z0-9-]{4,62}$/.test(env.GOOGLE_CLOUD_PROJECT || '') ||
        !/^[a-z0-9-]+$/.test(env.GOOGLE_CLOUD_LOCATION || '') ||
        !/^gemini-[a-z0-9.-]+$/.test(env.GEMINI_MODEL || ''))) throw new Error('CONFIG_REQUIRED');
    calls++;
    users.set(userId, (users.get(userId) || 0) + 1);
    const pending = (async () => {
      let fields = FIELDS;
      if (provider === 'vertex') {
        const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(15000)]);
        // Cloud Run service identity. No generated API keys or browser secrets.
        const auth = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
          headers: { 'Metadata-Flavor': 'Google' }, signal: combined,
        });
        if (!auth.ok) throw new Error('AUTH_UNAVAILABLE');
        const { access_token } = await auth.json();
        if (typeof access_token !== 'string') throw new Error('AUTH_UNAVAILABLE');
        const location = env.GOOGLE_CLOUD_LOCATION;
        const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
        const response = await fetcher(`https://${host}/v1/projects/${env.GOOGLE_CLOUD_PROJECT}/locations/${location}/publishers/google/models/${env.GEMINI_MODEL}:generateContent`, {
          method: 'POST', signal: combined,
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'For a family evacuation TRAINING questionnaire, order these four required fields: household_id, scenario, weather, time_of_day. Return each exactly once. Do not answer them or create routes, facts or resident verification.' }] }],
            generationConfig: { temperature: 0, candidateCount: 1, maxOutputTokens: 256, responseMimeType: 'application/json',
              ...(thinkingConfig(env.GEMINI_MODEL) ? { thinkingConfig: thinkingConfig(env.GEMINI_MODEL) } : {}),
              responseSchema: { type: 'OBJECT', properties: { fields: { type: 'ARRAY', items: { type: 'STRING', enum: FIELDS }, minItems: 4, maxItems: 4 } }, required: ['fields'] } },
          }),
        });
        if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
        const payload = await response.json();
        const candidate = payload.candidates?.[0];
        if (candidate?.finishReason !== 'STOP' || candidate.content?.parts?.length !== 1 ||
            typeof candidate.content.parts[0].text !== 'string' || candidate.content.parts[0].text.length > 1024) throw new Error('INVALID_MODEL_OUTPUT');
        fields = validateQuestions(JSON.parse(candidate.content.parts[0].text));
      }
      signal?.throwIfAborted();
      return { provider, fields, remaining_calls: maxCalls - calls };
    })();
    // Retain failures too: the same request cannot spend twice. Bounded by maxCalls.
    requests.set(key, pending);
    return pending;
  };
}
