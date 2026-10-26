import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
for (const f of ["pinterest-native-prepublish-gate", "pinterest-editor-in-chief"]) {
  Deno.test(`${f} guards before any work`, async () => {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    const guard = src.indexOf("await requireInternalOrAdmin(req)");
    assert(guard > 0, "guard missing");
    assert(guard < src.indexOf("req.json()"), "guard must run before reading body");
    assert(guard < src.indexOf("createClient(", src.indexOf("Deno.serve")), "guard must run before DB client");
  });
}
