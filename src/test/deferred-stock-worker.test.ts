import {it,expect,vi} from 'vitest';
import {runDeferredStockWorker} from '../../supabase/functions/_shared/deferred-stock-worker';
const claim={product_id:'p',cj_product_id:'cj',token:'lease'};
function io(result:Record<string,unknown>={confirmed:false,status:'no_data'}) {return {claim:vi.fn(async()=>claim),observe:vi.fn(async()=>result),finish:vi.fn(async()=>true)};}
it('does no supplier work without a claim',async()=>{const d=io();d.claim.mockResolvedValue(null as any);expect(await runDeferredStockWorker(d)).toEqual({claimed:false,verified:false});expect(d.observe).not.toHaveBeenCalled();});
it('persists no_data without claiming verified inventory',async()=>{const d=io();expect((await runDeferredStockWorker(d)).verified).toBe(false);expect(d.finish).toHaveBeenCalledOnce();});
it('records transport failure once, without tight retries',async()=>{const d=io();d.observe.mockRejectedValue(Error('timeout'));expect((await runDeferredStockWorker(d)).verified).toBe(false);expect(d.observe).toHaveBeenCalledTimes(1);expect(d.finish).toHaveBeenCalledOnce();});
it('never reports success when completion lost its lease',async()=>{const d=io();d.finish.mockResolvedValue(false);await expect(runDeferredStockWorker(d)).rejects.toThrow('expired');});
it('propagates database failures rather than report success',async()=>{const d=io();d.finish.mockRejectedValue(Error('db'));await expect(runDeferredStockWorker(d)).rejects.toThrow('db');});
it('reports supplier-confirmed zero stock only after persistence',async()=>{const d=io({confirmed:true,status:'ok',stock:0,warehouse:'US'});expect((await runDeferredStockWorker(d)).verified).toBe(true);});
it('rejects malformed confirmed observations as verification',async()=>{const d=io({confirmed:true,status:'ok',stock:null,warehouse:'US'});expect((await runDeferredStockWorker(d)).verified).toBe(false);});
