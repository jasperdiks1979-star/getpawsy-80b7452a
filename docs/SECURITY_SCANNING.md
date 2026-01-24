# Security Scanning Guide

## Overview

Dit project gebruikt meerdere security scanners om kwetsbaarheden te detecteren in dependencies, code, Docker images, en configuratiebestanden.

## Scanners

### 🔵 Snyk

**Dependency Scanning:**
- Scant `package.json` en `package-lock.json` op bekende kwetsbaarheden
- Controleert transitieve dependencies
- Biedt fix suggesties en upgrade paden

**Code Analysis (SAST):**
- Statische code analyse voor security issues
- Detecteert veelvoorkomende kwetsbaarheden (XSS, SQL injection, etc.)

**Setup:**
1. Maak een account aan op [snyk.io](https://snyk.io)
2. Genereer een API token in Account Settings
3. Voeg `SNYK_TOKEN` toe als GitHub Secret

### 🟢 Trivy

**Docker Image Scanning:**
- Scant OS packages in Docker images
- Detecteert kwetsbaarheden in base images
- Controleert applicatie dependencies

**Filesystem Scanning:**
- Scant alle bestanden in de repository
- Detecteert kwetsbare dependencies
- Vindt hardcoded secrets

**Secret Detection:**
- Detecteert API keys, passwords, tokens
- Scant git history voor gelekte secrets
- Ondersteunt custom secret patterns

**IaC Scanning:**
- Scant Dockerfile, docker-compose.yml
- Detecteert misconfiguraties
- Controleert best practices

### 🟠 NPM Audit

- Native npm security scanner
- Controleert tegen npm advisory database
- Faalt bij high/critical kwetsbaarheden

## GitHub Security Tab

Alle scan resultaten worden automatisch geüpload naar de GitHub Security tab:
- **Settings → Security → Code scanning alerts**
- Gefilterd per scanner categorie
- Automatische issue tracking

## Lokaal Scannen

### Snyk CLI

```bash
# Installeer Snyk CLI
npm install -g snyk

# Authenticeer
snyk auth

# Scan dependencies
snyk test

# Scan code
snyk code test

# Monitor project (continuous monitoring)
snyk monitor
```

### Trivy CLI

```bash
# Installeer Trivy
brew install trivy

# Scan filesystem
trivy fs .

# Scan Docker image
docker build -t getpawsy:local .
trivy image getpawsy:local

# Scan voor secrets
trivy fs --scanners secret .

# Scan IaC
trivy config .
```

### NPM Audit

```bash
# Run audit
npm audit

# Fix automatisch (waar mogelijk)
npm audit fix

# Force fix (let op: kan breaking changes veroorzaken)
npm audit fix --force

# JSON output voor CI
npm audit --json
```

## Severity Levels

| Level | Action | Timeline |
|-------|--------|----------|
| 🔴 Critical | Onmiddellijk fixen | < 24 uur |
| 🟠 High | Prioriteit | < 1 week |
| 🟡 Medium | Plannen | < 1 maand |
| 🟢 Low | Backlog | Als tijd beschikbaar |

## False Positives

### Negeren via Snyk

Maak `.snyk` bestand:
```yaml
version: v1.25.0
ignore:
  SNYK-JS-EXAMPLE-123456:
    - '*':
        reason: 'False positive - niet gebruikt in productie'
        expires: 2024-12-31T00:00:00.000Z
```

### Negeren via Trivy

Maak `.trivyignore`:
```
# CVE die niet van toepassing is
CVE-2024-12345

# Secret false positive
generic-api-key
```

## CI/CD Integration

De security workflow draait:
- Bij elke push naar `main`/`master`
- Bij elke pull request
- Wekelijks (scheduled scan)
- Handmatig via workflow dispatch

### Branch Protection

Aanbevolen: maak security checks required voor merge:
1. Ga naar Settings → Branches → Branch protection rules
2. Voeg `security-summary` toe aan required status checks

## Incident Response

Bij kritieke kwetsbaarheden:

1. **Assess**: Bepaal impact en exploitability
2. **Isolate**: Block indien nodig de kwetsbare functionaliteit
3. **Fix**: Update dependency of patch code
4. **Verify**: Run security scan opnieuw
5. **Deploy**: Push fix naar productie
6. **Document**: Log incident voor audit trail

## Reporting

Security issues worden automatisch gerapporteerd aan:
- GitHub Security tab
- (Optioneel) Slack/Discord via webhook
- (Optioneel) Email naar security team

## Compliance

Deze security setup helpt bij compliance met:
- OWASP Top 10
- CWE/SANS Top 25
- SOC 2 requirements
- GDPR security measures
