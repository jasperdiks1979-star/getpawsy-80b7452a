import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Run from repository root after installing @electric-sql/pglite in a disposable environment.
const db=new PGlite(); const root='./';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
CREATE TABLE products(id uuid PRIMARY KEY,cj_product_id text, stock integer,us_stock integer,eu_stock integer,cn_stock integer,stock_sync_status text,stock_sync_error text,last_stock_sync_at timestamptz,stock_source text,supplier_warehouse text,updated_at timestamptz);
CREATE TABLE sync_progress(id text PRIMARY KEY,status text,last_offset integer,total_products integer,synced_count integer,error_count integer,last_sync_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz);`);
for(const f of ['20261102181000_stock_sync_deferred_queue.sql','20261104100000_stock_deferred_worker.sql'])await db.exec(fs.readFileSync(root+'supabase/migrations/'+f,'utf8'));
const id='00000000-0000-4000-8000-000000000001';
await db.exec(`INSERT INTO products(id,cj_product_id,stock)VALUES('${id}','cj',42);INSERT INTO sync_progress VALUES('stock-sync','needs_review',1,1,0,1,NULL,NULL,NULL,NULL); INSERT INTO stock_sync_deferred(product_id,next_attempt_at,last_offset,reason) VALUES('${id}',now()-interval '1 hour',0,'no_data');`);
const call=async()=> (await db.query('select claim_deferred_stock_retry() as c')).rows[0].c;
const finish=async(c,r)=> (await db.query('select finish_deferred_stock_retry($1,$2,$3,$4) as ok',[id,c.token,'cj',JSON.stringify(r)])).rows[0].ok;
await db.exec("set request.jwt.claim.role='anon'");await assert.rejects(call,/Service role required/);
assert.equal((await db.query("select has_function_privilege('authenticated','claim_deferred_stock_retry()','execute') as allowed")).rows[0].allowed,false);
await db.exec("set request.jwt.claim.role='service_role'");
const c=await call();assert.equal(c.product_id,id);assert.equal(await call(),null);
assert.equal(await finish({...c,token:'00000000-0000-4000-8000-000000000099'},{confirmed:true,stock:0,status:'ok',warehouse:'US'}),false);
assert.equal(await finish(c,{confirmed:false,status:'no_data'}),true);
assert.equal((await db.query('select stock from products')).rows[0].stock,42);
assert.equal(await call(),null); // backoff enforced
await db.exec("update stock_deferred_worker_gate set next_call_at='-infinity';update stock_sync_deferred set next_attempt_at=now()-interval '1 hour'");
const c2=await call();assert.ok(c2);assert.equal(await finish(c,{confirmed:true,stock:0,status:'ok',warehouse:'US'}),false);
assert.equal(await finish(c2,{confirmed:true,stock:0,status:'ok',warehouse:'US'}),true);
assert.equal((await db.query('select stock from products')).rows[0].stock,0);
assert.equal((await db.query('select state from stock_sync_deferred')).rows[0].state,'resolved');
assert.equal((await db.query('select status from sync_progress')).rows[0].status,'needs_review');
// A crashed final claim is exhausted, not replayed with an unlimited budget.
await db.exec("update stock_deferred_worker_gate set next_call_at='-infinity';update stock_sync_deferred set state='pending',attempts=3,lease_until=now()-interval '1 minute',next_attempt_at=now()-interval '1 hour'");
assert.equal(await call(),null);assert.equal((await db.query('select state from stock_sync_deferred')).rows[0].state,'exhausted');
console.log('PASS: authorization, exclusive claim, backoff, wrong/replayed token, no_data preservation, confirmed zero, conservative checkpoint and crash exhaustion');await db.close();
