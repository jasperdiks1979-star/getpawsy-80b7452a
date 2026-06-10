// Final live Pinterest production audit
import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*' };
Deno.serve(async (req)=>{
  if (req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: conn } = await sb.from('pinterest_connection').select('access_token,username').limit(1).maybeSingle();
  const tok = conn?.access_token;
  const H = { Authorization:`Bearer ${tok}` };

  async function getAll(url:string, cap=2000){
    let out:any[]=[]; let bm:string|null=null; let pages=0;
    while(pages<50){
      const u = new URL(url); u.searchParams.set('page_size','100'); if(bm) u.searchParams.set('bookmark',bm);
      const r = await fetch(u.toString(),{headers:H}); const j = await r.json();
      if(!r.ok) return { error: j, status:r.status };
      out = out.concat(j.items||[]); bm = j.bookmark||null; pages++;
      if(!bm||out.length>=cap) break;
    }
    return { items: out };
  }

  const acct = await fetch('https://api.pinterest.com/v5/user_account',{headers:H}).then(r=>r.json());
  const pinsRes = await getAll('https://api.pinterest.com/v5/pins');
  const boardsRes = await getAll('https://api.pinterest.com/v5/boards');

  return new Response(JSON.stringify({ acct, pinsCount: pinsRes.items?.length, pinsErr: pinsRes.error, boardsCount: boardsRes.items?.length, boardsErr: boardsRes.error, samplePins: pinsRes.items?.slice(0,3) }, null, 2),
    { headers:{...corsHeaders,'Content-Type':'application/json'} });
});
