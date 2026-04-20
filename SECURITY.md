# Security Policy

## 🔒 Beveiligingsbeleid

De veiligheid van GetPawsy en onze gebruikers is onze hoogste prioriteit. We waarderen de hulp van security researchers en de community bij het identificeren van kwetsbaarheden.

## 📋 Ondersteunde Versies

| Versie | Ondersteund |
|--------|-------------|
| 1.x.x  | ✅ Actief ondersteund |
| < 1.0  | ❌ Niet ondersteund |

## 🚨 Een Kwetsbaarheid Melden

### Responsible Disclosure

Als je een beveiligingsprobleem hebt gevonden, volg dan deze stappen:

1. **Meld het privé** - Stuur GEEN openbare issues voor beveiligingsproblemen
2. **Email ons** - Stuur details naar: `security@getpawsy.pet`
3. **Wacht op bevestiging** - We reageren binnen 48 uur
4. **Werk samen** - Help ons het probleem te begrijpen en op te lossen

### Wat te Vermelden in je Rapport

```
Onderwerp: [SECURITY] Korte beschrijving van de kwetsbaarheid

1. Type kwetsbaarheid:
   - [ ] SQL Injection
   - [ ] Cross-Site Scripting (XSS)
   - [ ] Authentication Bypass
   - [ ] Authorization Issue
   - [ ] Data Exposure
   - [ ] Overig: ___

2. Getroffen component:
   (bijv. checkout flow, user authentication, admin panel)

3. Stappen om te reproduceren:
   1. Ga naar...
   2. Klik op...
   3. Observeer...

4. Verwacht gedrag:
   (Wat zou moeten gebeuren)

5. Werkelijk gedrag:
   (Wat er daadwerkelijk gebeurt)

6. Impact:
   (Beschrijf de potentiële schade)

7. Proof of Concept:
   (Screenshots, code snippets, of video)

8. Voorgestelde oplossing:
   (Optioneel, maar gewaardeerd)
```

### Alternatieve Meldingsmethoden

- **GitHub Security Advisories**: [Security Advisories](https://github.com/YOUR_USERNAME/YOUR_REPO/security/advisories/new)
- **PGP Encrypted Email**: Beschikbaar op aanvraag

## ⏱️ Response Tijdlijn

| Fase | Tijdlijn |
|------|----------|
| Eerste bevestiging | 48 uur |
| Triage & beoordeling | 5 werkdagen |
| Statusupdate | Elke 7 dagen |
| Patch development | Afhankelijk van ernst |
| Publieke disclosure | 90 dagen na fix |

### Ernst Classificatie

| Ernst | Beschrijving | Response |
|-------|--------------|----------|
| 🔴 **Critical** | Remote code execution, auth bypass, data breach | Onmiddellijke actie, fix binnen 24-48 uur |
| 🟠 **High** | Privilege escalation, significant data exposure | Fix binnen 7 dagen |
| 🟡 **Medium** | Limited data exposure, XSS | Fix binnen 30 dagen |
| 🟢 **Low** | Minor issues, info disclosure | Fix in volgende release |

## ✅ Scope - In Scope

De volgende componenten vallen binnen de scope van dit beleid:

- **Web Application**: `getpawsy.lovable.app` en gerelateerde subdomeinen
- **API Endpoints**: Alle publieke API endpoints
- **Authentication**: Login, registratie, password reset flows
- **Payment Processing**: Checkout en betalingsflows
- **User Data**: Persoonlijke gegevens en orderinformatie
- **Admin Panel**: Administratieve functionaliteit

### Specifieke Gebieden van Interesse

- Authentication & Authorization bypasses
- SQL Injection
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Server-Side Request Forgery (SSRF)
- Insecure Direct Object References (IDOR)
- Business logic flaws
- Payment manipulation
- Rate limiting bypasses
- Information disclosure

## ❌ Scope - Buiten Scope

De volgende vallen NIET binnen de scope:

- Denial of Service (DoS/DDoS) aanvallen
- Social engineering aanvallen
- Physical security issues
- Third-party services (tenzij direct gerelateerd aan onze implementatie)
- Issues die al bekend zijn of gemeld
- Theoretische kwetsbaarheden zonder proof of concept
- Automated scanner output zonder validatie
- Self-XSS
- Missing security headers die geen directe impact hebben
- SPF/DKIM/DMARC configuratie issues
- Clickjacking zonder aantoonbare impact

## 🎁 Erkenning

We waarderen verantwoordelijke disclosure en bieden:

- **Hall of Fame**: Vermelding op onze security acknowledgements pagina
- **Publieke erkenning**: Met je toestemming in release notes
- **Referentie**: Op aanvraag voor toekomstige werkgevers

> **Note**: We hebben momenteel geen bug bounty programma, maar we waarderen alle bijdragen aan onze veiligheid.

## 🛡️ Beveiligingsmaatregelen

### Huidige Implementaties

#### Authentication & Authorization
- ✅ JWT-based authentication
- ✅ Admin role verification via `user_roles` table
- ✅ Row Level Security (RLS) op alle tabellen
- ✅ Secure session management

#### Rate Limiting
- ✅ IP-based rate limiting op edge functions
- ✅ Function-level rate limiting via `check_rate_limit` RPC
- ✅ Brute-force bescherming op login

#### Data Protection
- ✅ Input validatie met Zod schemas
- ✅ SQL injection preventie via parameterized queries
- ✅ XSS preventie met DOMPurify
- ✅ HTTPS enforced
- ✅ Secure cookie flags

#### Monitoring & Logging
- ✅ Security event logging
- ✅ Failed login attempt tracking
- ✅ Anomaly detection voor verdachte patronen

### CI/CD Security

- ✅ Snyk dependency scanning
- ✅ Trivy container scanning
- ✅ NPM audit op elke PR
- ✅ Dependency review voor licenses
- ✅ Secret scanning

## 📜 Juridische Bescherming

We zullen geen juridische stappen ondernemen tegen security researchers die:

1. Te goeder trouw handelen
2. De responsible disclosure richtlijnen volgen
3. Geen data vernietigen of wijzigen
4. Geen services verstoren
5. Bevindingen niet openbaar maken voor de fix

## 🔄 Updates

Dit security beleid wordt regelmatig bijgewerkt. Laatste update: Januari 2026

---

**Vragen?** Neem contact op via `security@getpawsy.pet`
