# getpawsy.pet storing: diagnose (alleen gelezen, niets gewijzigd)

## Conclusie
Het is geen cache- of propagatieprobleem. Registry en nameservers zijn in orde. De oorzaak is dat de oranje wolk (Proxied) in Cloudflare aan staat, terwijl het domein in Lovable zonder proxy-modus gekoppeld is. Lovable ziet daardoor Cloudflare-adressen in plaats van 185.158.133.1 en rondt de installatie niet af. Lovable-server antwoordt met HTTP 421 ("host niet gekoppeld").

## Bewijs (23 okt 18:02 UTC)
- RDAP .pet-registry: status alleen "auto renew period", geen clientHold. Vervalt 2027-10-21. Laatst gewijzigd 23 okt 17:03 (de verlenging/opheffing).
- Nameservers bij registry en publiek: jaime/uma.ns.cloudflare.com. Delegatie: ok.
- A @ publiek: 104.21.2.185, 172.67.129.141 (Cloudflare-proxy). Lovable verwacht 185.158.133.1 → status "drifted". AAAA ook Cloudflare.
- www: zelfde Cloudflare-adressen, 301 → https://getpawsy.pet/ (werkt).
- https://getpawsy.pet/: HTTP 421 via Cloudflare; dat is de bron van de "not properly configured"-melding.
- TXT _lovable: juiste waarde aanwezig (eigendom "verified"), plus een tweede, foutieve waarde (`...a19b79bba072b7345e272f`, één "2" mist).
- CAA: geen records (geen blokkade voor certificaten). Cloudflare-randcertificaat geldig tot jan 2027.

## "0 record sets" / "No DNS records published yet"
Dat gaat alleen over DNS die Lovable zelf beheert. Jouw DNS staat bij Cloudflare (extern), dus 0 bij Lovable is normaal en geen fout. De 22 Cloudflare-records zijn niet verdwenen.

## Volgende stap voor eigenaar (kies één)
**Optie A (eenvoudigst):** in Cloudflare → DNS: zet A `@` (185.158.133.1) en CNAME `www` op **DNS only** (grijze wolk). Daarna in Lovable → Project Settings → Domains → **⋯ → Check again**. Lovable maakt dan zelf het certificaat; enkele minuten tot uren.

**Optie B (Cloudflare-proxy behouden, nodig voor je bestaande Cloudflare-regels/worker):** in Lovable het domein loskoppelen en opnieuw verbinden met **Advanced → "Uses Cloudflare or similar proxy"** aangevinkt, en de getoonde CNAME-verificatierecords in Cloudflare toevoegen. Let op: korte onderbreking tijdens herkoppeling.

**Opruimen (beide opties):** verwijder in Cloudflare de foutieve TXT `_lovable` met waarde eindigend op `...bba072b7345e272f`; laat de juiste (`...bba072b27345e272f`) staan.

Aanbeveling: optie B als je Cloudflare-redirects/worker wilt houden (project gebruikt die voor www→apex), anders optie A.

## Niet kunnen controleren
- Cloudflare-instellingen zelf (SSL-modus, page rules, worker-routes): geen toegang gebruikt.
- Of Lovable na de opheffing van clientHold een oudere certificaatpoging nog moet herstarten (zie "Check again").
- Status bij Shopify/Tucows-registrar buiten de publieke registry.

Ik heb niets aangepast in code, DNS, Cloudflare, registrar of publicatie.
