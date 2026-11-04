import { isAuthorizedStockSyncServiceRequest } from '../_shared/stock-sync-auth.ts';
Deno.serve(async (req) => {
 const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
 if (!isAuthorizedStockSyncServiceRequest(req.headers.get('authorization'), key)) {
  return new Response('Unauthorized', {status: 401});
 }
 if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
 try {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-stock`, {
   method:'POST', headers:{authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
   body:JSON.stringify({action:'deferred-retry-once'}), signal:AbortSignal.timeout(45000),
  });
  return new Response(await response.text(), {status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 } catch {
  // Do not retry an uncertain write; the durable lease owns crash recovery.
  return new Response(JSON.stringify({error:'Deferred worker interrupted; lease retained'}), {status:503,headers:{'Content-Type':'application/json'}});
 }
});
