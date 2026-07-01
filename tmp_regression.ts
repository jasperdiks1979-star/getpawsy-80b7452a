import { classify, nativeScore, decideAction } from "/dev-server/supabase/functions/pinterest-native-prepublish-gate/scoring.ts";

// Inline mirror of factory helpers (kept in sync with index.ts).
type CT = "lifestyle"|"educational"|"problem_solution"|"seasonal"|"entertainment";
function derive(n: string): { content_type: CT; pin_type: CT } {
  const s = (n||"").toLowerCase();
  if (/training|dental|grooming|feeder|bowl_station|fountain|interactive_toy|supplement|potty/.test(s)) return { content_type:"educational", pin_type:"educational" };
  if (/litter|pet_camera|dog_car|carrier|gps|harness/.test(s)) return { content_type:"problem_solution", pin_type:"problem_solution" };
  if (/scratcher|treats/.test(s)) return { content_type:"entertainment", pin_type:"entertainment" };
  if (/outdoor|enclosure|clothing/.test(s)) return { content_type:"seasonal", pin_type:"seasonal" };
  return { content_type:"lifestyle", pin_type:"lifestyle" };
}
const NATIVE_LIFESTYLE=["cozy","morning","sunny","evening","weekend","kitchen","living room","bedroom","patio","couch","outdoor"];
const NATIVE_HELPFUL=["how","tips","guide","checklist","best","signs","ways"];
const NATIVE_EDU=["guide","training","behavior","vet","expert","explained"];
const SHOWCASE=["buy","sale","discount","% off","shop now","new arrival","shop","deal"];
function strip(t: string) {
  let o = t.replace(/\bShop now[^.]*\.?/gi,"").replace(/\bShop\s+[A-Z][A-Za-z ]{2,30}\.?/g,"");
  for (const w of SHOWCASE) o = o.replace(new RegExp(`\\b${w}\\b`,"gi"),"");
  return o.replace(/\s{2,}/g," ").replace(/\s+([.,])/g,"$1").trim();
}
function has(t: string, arr: string[]) { const l=t.toLowerCase(); return arr.some(w=>l.includes(w)); }
function naturalize(desc: string, ct: CT): string {
  let d = strip(desc);
  const life = { lifestyle:"A cozy morning routine, right at home in the living room.", educational:"A simple guide to what actually works for daily use.", problem_solution:"Signs it's time to fix this, and the ways parents solve it.", seasonal:"Made for weekend outdoor time on the patio or in the garden.", entertainment:"A playful evening moment on the couch that pets love." } as const;
  const help = { lifestyle:"Tips for building a calmer, cozier home for your pet.", educational:"How to introduce it step by step, with expert-approved guidance.", problem_solution:"How to spot the signs early and the best ways to help.", seasonal:"Best ways to keep pets comfortable through the season.", entertainment:"Fun ways to keep your pet engaged during the evening." } as const;
  if (!has(d, NATIVE_LIFESTYLE)) d = `${d} ${life[ct]}`;
  const needsH = ct==="educational"||ct==="problem_solution"||ct==="seasonal";
  const pool = ct==="educational"?NATIVE_EDU:NATIVE_HELPFUL;
  if (needsH && !has(d, pool)) d = `${d} ${help[ct]}`;
  if (!needsH && !has(d, NATIVE_HELPFUL)) d = `${d} ${help[ct]}`;
  return d.replace(/\s{2,}/g," ").trim().slice(0,480);
}

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function q(sql: string): Promise<any[]> {
  const r = await fetch(`${url}/rest/v1/rpc/exec`, { method:"POST", headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json" }, body: JSON.stringify({sql}) });
  return await r.json();
}

// Just use psql via Deno subprocess for a straight sample.
const proc = new Deno.Command("psql", { stdout:"piped", stderr:"piped", args:["-t","-A","-F","\t","-c",
  `SELECT id, category_key, content_type, coalesce(pin_title,''), coalesce(pin_description,''), coalesce(rejection_reason,'')
   FROM pinterest_pin_queue
   WHERE status='rejected' AND rejection_reason LIKE 'native_gate:%'
   ORDER BY created_at DESC LIMIT 100`
]}).spawn();
const out = new TextDecoder().decode((await proc.output()).stdout);
const rows = out.trim().split("\n").filter(Boolean).map(l => {
  const [id,cat,ct,title,desc,rr] = l.split("\t");
  return { id, cat, ct, title, desc, rr };
});

let acceptedBefore = 0, acceptedAfter = 0, downrankAfter=0, rejectedAfter=0;
const sampleOut: any[] = [];
for (const r of rows) {
  const before = {
    id: r.id, status:"queued", priority:0, category_key:r.cat, content_type:r.ct,
    pin_title:r.title, pin_description:r.desc, hashtags:[], meta:null, created_at:new Date().toISOString(),
  } as any;
  const cB = classify(before), sB = nativeScore(before);
  const dB = decideAction({ score:sB.score, minScore:55, type:cB, overType:false, overCat:false });
  if (dB.action==="keep") acceptedBefore++;

  const cls = derive(r.cat||"");
  const newDesc = naturalize(r.desc, cls.content_type);
  const after = { ...before, content_type: cls.content_type, pin_description: newDesc, meta: { pin_type: cls.pin_type, content_type: cls.content_type } };
  const cA = classify(after), sA = nativeScore(after);
  const dA = decideAction({ score:sA.score, minScore:55, type:cA, overType:false, overCat:false });
  if (dA.action==="keep") acceptedAfter++;
  else if (dA.action==="downrank") downrankAfter++;
  else rejectedAfter++;
  if (sampleOut.length<5) sampleOut.push({ id:r.id.slice(0,8), cat:r.cat, before:{type:cB, score:sB.score, action:dB.action}, after:{type:cA, score:sA.score, action:dA.action, reason:dA.reason} });
}
console.log(JSON.stringify({
  total: rows.length,
  before: { accepted: acceptedBefore, rejected: rows.length-acceptedBefore },
  after: { accepted: acceptedAfter, downrank: downrankAfter, rejected: rejectedAfter },
  samples: sampleOut,
}, null, 2));
