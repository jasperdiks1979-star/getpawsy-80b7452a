## 📋 Description

<!-- Beschrijf de wijzigingen in detail. Wat doet deze PR en waarom? -->

### Samenvatting
<!-- Korte samenvatting in 1-2 zinnen -->

### Motivatie
<!-- Waarom is deze wijziging nodig? Welk probleem lost het op? -->

### Aanpak
<!-- Hoe heb je dit opgelost? Welke keuzes heb je gemaakt? -->

---

## 🏷️ Type of Change

<!-- Vink aan wat van toepassing is -->

- [ ] 🐛 **Bug fix** - Non-breaking change die een issue oplost
- [ ] ✨ **New feature** - Non-breaking change die functionaliteit toevoegt
- [ ] 💥 **Breaking change** - Fix of feature die bestaande functionaliteit breekt
- [ ] 📝 **Documentation** - Alleen documentatie wijzigingen
- [ ] ♻️ **Refactoring** - Code verbetering zonder functionele wijzigingen
- [ ] 🎨 **Style/UI** - Visuele of styling wijzigingen
- [ ] ⚡ **Performance** - Performance verbetering
- [ ] 🔧 **Configuration** - Build, CI/CD of configuratie wijzigingen
- [ ] 🧪 **Tests** - Test toevoegingen of updates
- [ ] 🔒 **Security** - Security gerelateerde wijzigingen

---

## ✅ Pre-Submit Checklist

### Code Quality
- [ ] Code volgt project conventions (ESLint + Prettier passing)
- [ ] Self-review van eigen code uitgevoerd
- [ ] Geen `console.log` of debug statements achtergelaten
- [ ] Geen hardcoded waarden die configureerbaar moeten zijn
- [ ] TypeScript types correct gedefinieerd (geen `any` waar vermijdbaar)
- [ ] Componenten zijn klein en gefocust (< 200 regels)
- [ ] Design tokens gebruikt i.p.v. hardcoded kleuren

### Testing
- [ ] Unit tests toegevoegd/bijgewerkt voor nieuwe functionaliteit
- [ ] E2E tests toegevoegd voor kritieke user flows (indien van toepassing)
- [ ] Alle tests slagen lokaal (`npm test`)
- [ ] Handmatig getest in browser (Chrome + Firefox)
- [ ] Getest op mobiel viewport (responsive)
- [ ] Edge cases en error states getest

### Documentation
- [ ] README/docs bijgewerkt indien nodig
- [ ] JSDoc/TSDoc comments voor publieke APIs
- [ ] Inline comments voor complexe logica
- [ ] CHANGELOG entry (indien significant)

### Security
- [ ] Geen secrets of API keys in code
- [ ] RLS policies voor nieuwe database tables
- [ ] Input validatie met Zod schemas
- [ ] XSS preventie (geen `dangerouslySetInnerHTML` met user input)
- [ ] SQL injection preventie (parameterized queries)

### Accessibility
- [ ] Semantische HTML elementen gebruikt
- [ ] ARIA labels waar nodig
- [ ] Keyboard navigatie werkt
- [ ] Voldoende kleurcontrast
- [ ] Alt teksten voor afbeeldingen

---

## 📸 Screenshots / Video

<!-- Voeg screenshots of screen recordings toe voor UI changes -->
<!-- Gebruik de tabel voor before/after vergelijkingen -->

<details>
<summary>📱 Mobile View</summary>

| Before | After |
|--------|-------|
| <!-- screenshot --> | <!-- screenshot --> |

</details>

<details>
<summary>🖥️ Desktop View</summary>

| Before | After |
|--------|-------|
| <!-- screenshot --> | <!-- screenshot --> |

</details>

---

## 📊 Performance Impact

<!-- Vink aan wat van toepassing is -->

- [ ] ⚪ N/A - Geen significante performance impact verwacht
- [ ] 🟢 Positief - Performance verbeterd
- [ ] 🟡 Neutraal - Minimale impact
- [ ] 🔴 Negatief - Potentiële performance regressie (uitleg vereist)

### Metrics (indien van toepassing)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Bundle Size (JS) | - KB | - KB | ±0 KB |
| Lighthouse Performance | - | - | - |
| First Contentful Paint | - ms | - ms | - |
| Largest Contentful Paint | - ms | - ms | - |

---

## 🔗 Related Issues

<!-- Link naar gerelateerde GitHub issues met keywords -->

- Fixes #<!-- issue nummer -->
- Closes #<!-- issue nummer -->
- Related to #<!-- issue nummer -->
- Part of #<!-- epic/milestone nummer -->

---

## 🚀 Deployment Notes

### Database Changes
- [ ] Geen database wijzigingen
- [ ] Migration toegevoegd (automatisch via Lovable)
- [ ] Data migration script nodig (handmatig)

### Environment / Secrets
- [ ] Geen nieuwe environment variables
- [ ] Nieuwe secrets toegevoegd (documenteer welke)

### Edge Functions
- [ ] Geen edge function wijzigingen
- [ ] Nieuwe edge function(s): `<!-- naam -->`
- [ ] Bestaande edge function gewijzigd: `<!-- naam -->`

### Breaking Changes
<!-- Beschrijf breaking changes en migratiepad -->

```
Geen breaking changes
```

### Rollback Plan
<!-- Hoe kunnen we terugdraaien als er iets misgaat? -->

```
Standaard git revert is voldoende
```

---

## 👀 Review Focus Areas

<!-- Help reviewers door aan te geven waar ze extra op moeten letten -->

- [ ] **Architectuur** - Feedback gewenst op structuur/aanpak
- [ ] **Security** - Extra security review nodig
- [ ] **Performance** - Performance review gewenst
- [ ] **UX** - Gebruikerservaring feedback gewenst
- [ ] **Accessibility** - A11y review nodig

### Specifieke vragen voor reviewers
<!-- Stel concrete vragen waar je feedback op wilt -->

1. 
2. 

---

## 📝 Additional Notes

<!-- Andere informatie voor reviewers, context, trade-offs, etc. -->

---

## 🤖 CI Status Checklist

<!-- Deze worden automatisch gecheckt door CI -->

| Check | Status |
|-------|--------|
| Unit Tests (Node 18, 20, 22) | ⏳ Pending |
| Coverage Report | ⏳ Pending |
| Bundle Size (< 2MB) | ⏳ Pending |
| Core Web Vitals | ⏳ Pending |
| Accessibility Tests | ⏳ Pending |
| E2E Checkout Tests | ⏳ Pending |
| Security Scan (NPM Audit) | ⏳ Pending |
