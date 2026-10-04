// Offline proposal lint only. Never connects, executes deployment, or grants approval.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const keys = ['gcp_project_id', 'billing_account_id', 'run_region', 'model_location', 'gemini_model',
  'supabase_project_ref', 'supabase_db_host', 'supabase_db_user', 'supabase_plan',
  'runtime_service_account', 'build_service_account', 'image_repository', 'db_password_secret',
  'netlify_origin', 'maintenance_until', 'credit_scope_verified', 'max_out_of_pocket_yen'];
export function inspectDeploymentPlan(plan) {
  const issues = [];
  const check = (valid, code) => { if (!valid) issues.push(code); };
  const object = plan && typeof plan === 'object' && !Array.isArray(plan);
  if (!object || Object.keys(plan).some(key => !keys.includes(key))) {
    return { configuration_valid: false, ready_to_deploy: false, live_ai_enabled: false, issues: ['INVALID_PLAN_FIELDS'] };
  }
  const project = typeof plan.gcp_project_id === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(plan.gcp_project_id);
  check(project, 'GCP_PROJECT_REQUIRED');
  check(typeof plan.billing_account_id === 'string' && /^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/i.test(plan.billing_account_id), 'BILLING_ACCOUNT_REQUIRED');
  check(typeof plan.run_region === 'string' && /^[a-z]+-[a-z]+[0-9]$/.test(plan.run_region), 'RUN_REGION_REQUIRED');
  check(plan.model_location === 'global', 'MODEL_LOCATION_REVIEW_REQUIRED');
  // Candidate verified 2026-10-04, available beyond the event maintenance date.
  // Older 2.5 models retire before 12/1. Other choices need their own review.
  check(plan.gemini_model === 'gemini-3.1-flash-lite', 'MODEL_LIFECYCLE_REVIEW_REQUIRED');
  const ref = typeof plan.supabase_project_ref === 'string' && /^[a-z0-9]{20}$/.test(plan.supabase_project_ref);
  check(ref, 'SUPABASE_PROJECT_REQUIRED');
  check(typeof plan.supabase_db_host === 'string' && /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(plan.supabase_db_host), 'SESSION_POOLER_HOST_REQUIRED');
  check(ref && plan.supabase_db_user === `training_executor.${plan.supabase_project_ref}`, 'DEDICATED_DB_USER_REQUIRED');
  check(['free', 'pro'].includes(plan.supabase_plan), 'SUPABASE_PLAN_REQUIRED');
  for (const [key, code] of [['runtime_service_account', 'RUNTIME_ID_REQUIRED'], ['build_service_account', 'BUILD_ID_REQUIRED']]) {
    const parts = typeof plan[key] === 'string' ? plan[key].split('@') : [];
    check(project && parts.length === 2 && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(parts[0]) && parts[1] === `${plan.gcp_project_id}.iam.gserviceaccount.com`, code);
  }
  check(plan.runtime_service_account !== plan.build_service_account, 'SEPARATE_IDENTITIES_REQUIRED');
  check(typeof plan.image_repository === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(plan.image_repository), 'IMAGE_REPOSITORY_REQUIRED');
  const secretParts = typeof plan.db_password_secret === 'string' ? plan.db_password_secret.split('/') : [];
  check(project && secretParts.length === 6 && secretParts[0] === 'projects' && secretParts[1] === plan.gcp_project_id && secretParts[2] === 'secrets' && /^[a-zA-Z0-9_-]{1,255}$/.test(secretParts[3]) && secretParts[4] === 'versions' && /^[1-9][0-9]*$/.test(secretParts[5]), 'PINNED_DB_SECRET_REFERENCE_REQUIRED');
  try { const url = new URL(plan.netlify_origin); check(url.protocol === 'https:' && url.origin === plan.netlify_origin && url.hostname.endsWith('.netlify.app'), 'EXACT_NETLIFY_ORIGIN_REQUIRED'); }
  catch { check(false, 'EXACT_NETLIFY_ORIGIN_REQUIRED'); }
  check(plan.maintenance_until === '2026-12-01', 'EVENT_MAINTENANCE_DATE_REQUIRED');
  check(Number.isSafeInteger(plan.max_out_of_pocket_yen) && plan.max_out_of_pocket_yen >= 0, 'EXPLICIT_CASH_BUDGET_REQUIRED');
  check(plan.credit_scope_verified === true, 'CREDIT_SCOPE_UNCONFIRMED');
  return { configuration_valid: issues.length === 0, ready_to_deploy: false, live_ai_enabled: false, issues,
    blockers: ['EXTERNAL_SETTINGS_AND_APPROVAL_REQUIRED', 'REAL_AI_RELEASE_LOCKED', 'HOSTED_AUTH_DB_UNTESTED', 'POST_CREDIT_PERIOD_BUDGET_REQUIRED'],
    warnings: plan.supabase_plan === 'free' ? ['FREE_DB_INACTIVITY_PAUSE_RISK'] : [],
    limits: { global_calls: 20, per_user_calls: 3, output_tokens_per_call: 256, automatic_retries: 0, model_turns_per_request: 1 },
    note: 'Syntax checks only. No account, billing, resource, secret value, permission or availability has been verified. A plan cannot authorize an operation or cap spending.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const bytes = await readFile(process.argv[2]);
    if (bytes.length > 16384) throw Error('INVALID_PLAN');
    const result = inspectDeploymentPlan(JSON.parse(bytes.toString('utf8')));
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.configuration_valid ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ configuration_valid: false, ready_to_deploy: false, live_ai_enabled: false, issues: ['UNREADABLE_OR_INVALID_PLAN'] })); process.exitCode = 1;
  }
}
