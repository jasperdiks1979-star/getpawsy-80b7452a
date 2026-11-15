/** Configuration validation only. Never creates resources, deploys or contacts APIs. */
import { pathToFileURL } from 'node:url';
export function validatePreview(env) {
  const errors = [];
  let target;
  try { target = new URL(env.VITE_SUPABASE_URL); } catch { errors.push('Independent backend URL is required'); }
  if (target && (target.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(target.hostname) || target.hostname === 'nojvgfbcjgipjxpfatmm.supabase.co' || target.username || target.password || target.search || target.hash || target.pathname !== '/')) errors.push('Backend must be an independent hosted Supabase project origin');
  const pub = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!pub) errors.push('Public backend key is required');
  if (pub && !pub.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(Buffer.from(pub.split('.')[1], 'base64url'));
      if (payload.role !== 'anon' || payload.ref !== target?.hostname.split('.')[0]) errors.push('Legacy public key must be anon and match the preview project');
    } catch { errors.push('Public backend key format is invalid'); }
  }
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/.test(name) && env[name]) errors.push(`Forbidden browser credential variable: ${name}`);
  }
  if (env.STRIPE_MODE !== 'test') errors.push('Stripe test mode is required');
  if (env.STRIPE_SECRET_KEY_LIVE) errors.push('Live Stripe key must be absent');
  if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) errors.push('Only test Stripe keys are allowed');
  if (env.VITE_STRIPE_PUBLISHABLE_KEY && !env.VITE_STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) errors.push('Only test Stripe publishable keys are allowed');
  for (const name of ['CJ_API_KEY','CJ_API_SECRET','CJ_PASSWORD','RESEND_API_KEY','LOVABLE_API_KEY','RUNWAY_API_KEY','ELEVENLABS_API_KEY']) {
    if (env[name]) errors.push(`Outbound provider credential must be absent in initial preview: ${name}`);
  }
  if (env.MIGRATION_SCHEDULES_ENABLED !== 'false') errors.push('Preview schedules must be explicitly disabled');
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validatePreview(process.env);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Configuration gate passed. This does not verify remote secrets, data, network isolation or authorize deployment.');
}
