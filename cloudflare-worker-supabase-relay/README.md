# getpawsy-supabase-relay

Same-origin authenticated relay from `getpawsy.pet/api/edge/<fn>` to the
Supabase Edge Function `<fn>`. Removes the failing cross-origin authenticated
POST that iPhone Safari refuses on `*.supabase.co` for this admin surface.

## Deploy

```
cd cloudflare-worker-supabase-relay
wrangler deploy --env production
```

Routes bound in `wrangler.toml`:
- `getpawsy.pet/api/edge/*`
- `www.getpawsy.pet/api/edge/*`

## Contract

`POST /api/edge/<function-name>` — allowed only for functions in the
in-worker allowlist (`merchant-api-probe`, `merchant-api-shadow`).

Headers forwarded upstream:
- `Authorization: Bearer <user JWT>` — verbatim, pass-through only. The
  worker never attaches a service-role key.
- `apikey: <publishable anon key>` — required by the Functions gateway.
- `content-type` — if the caller sent one.

Response: upstream `status`, JSON body verbatim, with hop-by-hop and CORS
headers stripped and `x-relay-upstream-status` added for diagnostics.

## Why it fixes the iPhone Safari failure

| Path | Origin | CORS preflight | Observed |
| --- | --- | --- | --- |
| Direct GET `https://…supabase.co/functions/v1/merchant-api-probe` | cross | no | 200 `{ok:false,error:"missing_auth"}` |
| Browser POST `https://…supabase.co/functions/v1/merchant-api-probe` with Bearer + apikey | cross | **yes** (adds `authorization`, `apikey`) | `TypeError: Load failed` on iOS Safari |
| Server-side relay POST from Cloudflare Worker to same URL, same JWT | server-to-server | n/a | 200 with real function body |
| Browser POST `https://getpawsy.pet/api/edge/merchant-api-probe` | **same-origin** | no | Works — no preflight, no cross-origin fetch |

iOS Safari is aborting the preflighted authenticated cross-origin POST before
it reaches the network (hence the direct GET works fine). Moving the browser
call to the same origin removes the preflight and the cross-origin transport,
while the worker completes the trusted server-to-server hop with the user's
own JWT.