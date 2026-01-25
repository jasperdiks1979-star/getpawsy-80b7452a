# Branch Protection Rules Setup Guide

## Overview

Dit document beschrijft de aanbevolen branch protection rules voor de GitHub repository om code kwaliteit en veilige deployments te garanderen.

## Recommended Branch Protection Rules

### Main Branch (`main` of `master`)

Ga naar **Settings → Branches → Add branch protection rule**

#### Basic Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Branch name pattern** | `main` | Bescherm de productie branch |
| **Require a pull request before merging** | ✅ Enabled | Voorkom directe pushes |
| **Require approvals** | 1-2 | Code review afdwingen |
| **Dismiss stale pull request approvals** | ✅ Enabled | Nieuwe changes vereisen nieuwe review |
| **Require review from Code Owners** | Optional | Voor grotere teams |

#### Status Checks

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Require status checks to pass** | ✅ Enabled | CI moet slagen |
| **Require branches to be up to date** | ✅ Enabled | Voorkom merge conflicts |

**Required status checks (exact job names):**
- `Unit Tests (Node 18)` - Unit tests op Node 18
- `Unit Tests (Node 20)` - Unit tests op Node 20
- `Unit Tests (Node 22)` - Unit tests op Node 22
- `Coverage Report (Node 20)` - Coverage rapportage
- `Analyze Bundle Size` - Bundle size check (max 2MB)
- `Core Web Vitals Budget` - Performance budget
- `Visual Regression Tests` - Visuele regressie tests
- `Accessibility Tests` - A11y tests met axe-core
- `E2E Checkout Tests` - Checkout flow tests
- `Snyk Dependency Scan` - Dependency security
- `NPM Audit` - NPM security audit
- `Dependency Review` - License & security review

#### Additional Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Require conversation resolution** | ✅ Enabled | Alle comments moeten addressed zijn |
| **Require signed commits** | Optional | Extra security voor enterprises |
| **Require linear history** | Optional | Cleaner git history |
| **Include administrators** | ✅ Enabled | Regels gelden ook voor admins |
| **Restrict who can push** | Optional | Limit wie kan mergen |
| **Allow force pushes** | ❌ Disabled | Bescherm history |
| **Allow deletions** | ❌ Disabled | Voorkom branch deletion |

### Development Branch (`develop`)

Als je een GitFlow workflow gebruikt:

| Setting | Value |
|---------|-------|
| **Require a pull request** | ✅ Enabled |
| **Require approvals** | 1 |
| **Require status checks** | ✅ (tests only) |
| **Allow force pushes** | ❌ Disabled |

### Feature Branches (`feature/*`)

Geen branch protection nodig - deze worden gemerged naar `develop` of `main` via PRs.

## Setup via GitHub CLI

```bash
# Install GitHub CLI (als nog niet geïnstalleerd)
brew install gh

# Login
gh auth login

# Create branch protection rule voor main
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Unit Tests (Node 18)","Unit Tests (Node 20)","Unit Tests (Node 22)","Coverage Report (Node 20)","Analyze Bundle Size","Core Web Vitals Budget","Accessibility Tests","E2E Checkout Tests","NPM Audit"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

## Setup via Terraform

```hcl
resource "github_branch_protection" "main" {
  repository_id = github_repository.repo.node_id
  pattern       = "main"

  required_status_checks {
    strict   = true
    contexts = [
      "Unit Tests (Node 18)",
      "Unit Tests (Node 20)", 
      "Unit Tests (Node 22)",
      "Coverage Report (Node 20)",
      "Analyze Bundle Size",
      "Core Web Vitals Budget",
      "Accessibility Tests",
      "E2E Checkout Tests",
      "NPM Audit"
    ]
  }

  required_pull_request_reviews {
    required_approving_review_count = 1
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
  }

  enforce_admins = true

  allows_deletions    = false
  allows_force_pushes = false
}
```

## CODEOWNERS Setup

Maak een `CODEOWNERS` bestand aan in `.github/`:

```
# .github/CODEOWNERS

# Default owners for everything
*       @team-lead @senior-dev

# Frontend code
/src/components/     @frontend-team
/src/pages/          @frontend-team

# Backend/Edge Functions
/supabase/functions/ @backend-team

# Infrastructure & CI/CD
/.github/            @devops-team
/Dockerfile          @devops-team
/docker-compose.yml  @devops-team

# Security-sensitive files
/src/contexts/AuthContext.tsx    @security-team
/supabase/functions/stripe-*/    @security-team @finance-team
```

## Workflow Integration

### Required Workflow Runs

Zorg ervoor dat de volgende workflows succesvol draaien voordat merge mogelijk is:

1. **`.github/workflows/test.yml`** - Unit tests met Vitest
2. **`.github/workflows/security.yml`** - Security scanning
3. **`.github/workflows/performance-budget.yml`** - Lighthouse performance

### Auto-merge voor Dependabot

Voeg toe aan `.github/workflows/dependabot-automerge.yml`:

```yaml
name: Dependabot Auto-merge

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  dependabot:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - name: Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Auto-merge minor/patch updates
        if: steps.metadata.outputs.update-type == 'version-update:semver-minor' || steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Recommended PR Template

Maak `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description
<!-- Beschrijf de wijzigingen in detail -->

## Type of Change
- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 💥 Breaking change
- [ ] 📝 Documentation update
- [ ] ♻️ Refactoring
- [ ] 🎨 Style/UI changes

## Checklist
- [ ] Mijn code volgt de code style van dit project
- [ ] Ik heb self-review gedaan van mijn code
- [ ] Ik heb comments toegevoegd waar nodig
- [ ] Mijn changes genereren geen nieuwe warnings
- [ ] Ik heb tests toegevoegd die mijn fix/feature bewijzen
- [ ] Nieuwe en bestaande unit tests slagen lokaal
- [ ] Afhankelijke changes zijn al gemerged en gepubliceerd

## Screenshots (indien van toepassing)
<!-- Voeg screenshots toe voor UI changes -->

## Related Issues
<!-- Link naar gerelateerde issues: Fixes #123 -->
```

## Verification Checklist

Na het opzetten van branch protection, verifieer:

- [ ] Directe push naar `main` is geblokkeerd
- [ ] PRs vereisen minstens 1 approval
- [ ] Status checks moeten slagen
- [ ] Force push is uitgeschakeld
- [ ] Branch deletion is uitgeschakeld
- [ ] Stale reviews worden dismissed bij nieuwe commits
- [ ] CODEOWNERS zijn geconfigureerd (indien gewenst)

## Troubleshooting

### "Required status check is expected"
- Zorg ervoor dat de workflow naam exact overeenkomt
- Check of de workflow succesvol heeft gedraaid op een andere branch

### "Merge blocked by branch protection"
- Controleer of alle required checks groen zijn
- Verifieer dat je de benodigde approvals hebt
- Check of je branch up-to-date is met main

### Admin kan niet bypassen
- "Include administrators" staat aan
- Dit is gewenst voor security, maar kan voor noodgevallen worden uitgezet
