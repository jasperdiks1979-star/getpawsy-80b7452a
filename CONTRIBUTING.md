# Contributing to GetPawsy

Bedankt voor je interesse in het bijdragen aan GetPawsy! 🐾

## 📋 Inhoudsopgave

- [Code of Conduct](#code-of-conduct)
- [Aan de Slag](#aan-de-slag)
- [Development Workflow](#development-workflow)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)

## Code of Conduct

We verwachten dat alle contributors zich respectvol gedragen. Wees vriendelijk, constructief en help anderen waar mogelijk.

## Aan de Slag

### Prerequisites

- Node.js 18+ (aanbevolen: 20 LTS)
- npm of bun
- Git

### Lokale Setup

```bash
# Clone de repository
git clone <repository-url>
cd getpawsy

# Installeer dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Kopieer `.env.example` naar `.env` en vul de benodigde waarden in (indien van toepassing).

## Development Workflow

1. **Fork** de repository
2. **Clone** je fork lokaal
3. **Maak een branch** voor je feature of fix
4. **Commit** je wijzigingen (zie [Commit Conventions](#commit-conventions))
5. **Push** naar je fork
6. **Open een Pull Request**

### Branch Naming

Gebruik beschrijvende branch namen:

```
feature/add-user-authentication
fix/cart-total-calculation
docs/update-api-documentation
chore/upgrade-dependencies
```

## Commit Conventions

We gebruiken [Conventional Commits](https://www.conventionalcommits.org/) voor consistente commit messages. Dit wordt automatisch afgedwongen via Husky en commitlint.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Beschrijving |
|------|-------------|
| `feat` | Nieuwe feature |
| `fix` | Bug fix |
| `docs` | Documentatie wijzigingen |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring (geen feature of bug fix) |
| `perf` | Performance verbeteringen |
| `test` | Tests toevoegen of wijzigen |
| `build` | Build system of dependencies |
| `ci` | CI/CD configuratie |
| `chore` | Overige taken (geen src of test wijzigingen) |
| `revert` | Revert een eerdere commit |

### Voorbeelden

```bash
# Feature
feat(auth): add Google OAuth login

# Bug fix
fix(cart): correct total calculation with discounts

# Documentation
docs(readme): add installation instructions

# Refactoring
refactor(products): extract price formatting to utility

# CI/CD
ci(github): add bundle size check workflow
```

### Scopes

Veelgebruikte scopes:
- `auth` - Authenticatie
- `cart` - Winkelwagen
- `products` - Producten
- `checkout` - Checkout flow
- `admin` - Admin dashboard
- `ui` - UI componenten
- `api` - API/Edge functions
- `deps` - Dependencies
- `ci` - CI/CD

## Pull Request Process

### Voordat je een PR opent

- [ ] Zorg dat je code compileert (`npm run build`)
- [ ] Voer alle tests uit (`npm test`)
- [ ] Check linting (`npm run lint`)
- [ ] Format je code (`npm run format`)
- [ ] Update documentatie indien nodig

### PR Requirements

1. **Titel**: Volg conventional commit format
   ```
   feat(products): add product comparison feature
   ```

2. **Beschrijving**: Gebruik de PR template en beschrijf:
   - Wat doet deze PR?
   - Waarom is dit nodig?
   - Hoe is het getest?
   - Screenshots (voor UI wijzigingen)

3. **Size**: Houd PRs klein en gefocust
   - < 400 regels is ideaal
   - > 1000 regels vereist extra review

4. **Labels**: Worden automatisch toegevoegd via PR labeler

### Required Checks

De volgende checks moeten slagen voordat een PR gemerged kan worden:

- ✅ Unit Tests (Node 18, 20, 22)
- ✅ Coverage Report (Node 20)
- ✅ Bundle Size Check (max 2MB)
- ✅ Core Web Vitals Budget
- ✅ Accessibility Tests
- ✅ E2E Checkout Tests
- ✅ NPM Audit

### Review Process

1. Minimaal 1 approving review vereist
2. Stale reviews worden automatisch dismissed bij nieuwe commits
3. Alle conversations moeten resolved zijn
4. Branch moet up-to-date zijn met `main`

## Code Standards

### TypeScript

- Gebruik strict TypeScript (`strict: true`)
- Definieer types expliciet waar nodig
- Vermijd `any` - gebruik `unknown` als type onbekend is
- Gebruik interfaces voor objecten, types voor unions/primitives

```typescript
// ✅ Goed
interface Product {
  id: string;
  name: string;
  price: number;
}

// ❌ Vermijd
const product: any = { ... };
```

### React

- Gebruik functionele componenten met hooks
- Prefer named exports
- Gebruik React.memo() voor performance waar nodig
- Keep components small and focused

```tsx
// ✅ Goed
export function ProductCard({ product }: ProductCardProps) {
  return <div>...</div>;
}

// ❌ Vermijd
export default function(props) {
  return <div>...</div>;
}
```

### Styling

- Gebruik Tailwind CSS utility classes
- Gebruik design tokens uit `index.css` en `tailwind.config.ts`
- Vermijd inline styles
- Gebruik CSS variabelen voor theming

```tsx
// ✅ Goed - semantic tokens
<div className="bg-background text-foreground">

// ❌ Vermijd - hardcoded colors
<div className="bg-white text-black">
```

### File Structure

```
src/
├── components/
│   ├── ui/          # Basis UI componenten (shadcn)
│   ├── layout/      # Layout componenten
│   ├── products/    # Product-gerelateerde componenten
│   └── ...
├── hooks/           # Custom React hooks
├── lib/             # Utility functions
├── pages/           # Route pagina's
└── contexts/        # React contexts
```

## Testing Requirements

### Unit Tests

- Schrijf tests voor nieuwe features
- Minimum coverage: 70%
- Gebruik Vitest als test runner

```typescript
import { describe, it, expect } from 'vitest';

describe('formatPrice', () => {
  it('should format price with currency symbol', () => {
    expect(formatPrice(1999)).toBe('€19.99');
  });
});
```

### E2E Tests

- Gebruik Playwright voor E2E tests
- Test kritieke user flows (checkout, auth)
- Voeg accessibility assertions toe

```typescript
import { test, expect } from '@playwright/test';

test('user can complete checkout', async ({ page }) => {
  await page.goto('/cart');
  // ...
});
```

### Running Tests

```bash
# Unit tests
npm test

# Unit tests met coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# Specifieke test file
npm test -- src/lib/pricing.test.ts
```

## Vragen?

- Open een [Discussion](https://github.com/YOUR_USERNAME/YOUR_REPO/discussions)
- Check bestaande [Issues](https://github.com/YOUR_USERNAME/YOUR_REPO/issues)

Bedankt voor je bijdrage! 🎉
