import { describe, it, expect } from "vitest";
function classify(o:any){
  const amount = Number(o?.total_amount||0);
  const items = Array.isArray(o?.items)?o.items:[];
  const ssid=String(o?.stripe_session_id||""); const piid=String(o?.stripe_payment_intent_id||"");
  if(o?.is_test===true||o?.test===true) return "test";
  if(ssid.startsWith("cs_test_")||piid.startsWith("pi_test_")) return "test";
  if(items.length===0) return "test";
  if(amount<=0) return "test";
  const TEST_RE = /(^|[-_\s])(test|smoke|canary|validation|qa|dev)(-payment|[-_\s]|$)/i;
  if(items.some((it:any)=>TEST_RE.test(String(it?.id??""))||TEST_RE.test(String(it?.name??""))||TEST_RE.test(String(it?.sku??"")))) return "test";
  return "genuine";
}
describe("classifier",()=>{
  it("flags TEST-PAYMENT-VALIDATION as test",()=>{
    expect(classify({stripe_session_id:"cs_live_a1",total_amount:0.5,items:[{id:"TEST-PAYMENT-VALIDATION",name:"Test Payment",price:0.5,quantity:1}]})).toBe("test");
  });
  it("keeps low-value real product as genuine",()=>{
    expect(classify({stripe_session_id:"cs_live_x",total_amount:0.5,items:[{id:"cj-12345",name:"Cat Toy",price:0.5,quantity:1}]})).toBe("genuine");
  });
  it("flags zero-line-item smoke",()=>{
    expect(classify({stripe_session_id:"cs_live_x",total_amount:1,items:[]})).toBe("test");
  });
  it("flags cs_test gateway",()=>{
    expect(classify({stripe_session_id:"cs_test_x",total_amount:5,items:[{id:"cj-1",name:"Bed"}]})).toBe("test");
  });
});
