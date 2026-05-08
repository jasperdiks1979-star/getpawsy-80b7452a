# Pinterest Competitive Intelligence + Creative Pattern Engine

Adds a structured pattern layer on top of the existing Creative Director so every generated pin is built from a research-backed Pinterest winning pattern — not from scratch and not from a template. The engine studies, encodes, and applies the underlying visual psychology of top-performing pet pins without literally copying any competitor asset.

## Approach (important)

Pinterest does not expose a competitive-research API and large-scale scraping of competitor pins is out of scope. Instead we build a **curated pattern library** that codifies the documented winning patterns (cozy interior, before/after transformation, editorial minimal, etc.), plus an **optional research refresh** that uses the existing Perplexity / Firecrawl connectors to pull *summaries and insights* (no images, no asset copying) and feed them back into the library. This stays compliant with Pinterest's TOS and keeps the system fully self-contained.

## What we're building

1. **Pattern Library** — typed catalog of ~12 winning Pinterest patterns with composition / typography / mood / hook fingerprints
2. **Pattern → Niche scoring** — each niche from `pinterest-style-dna.ts` gets ranked pattern weights
3. **Pattern selector** — picks the right pattern per brief, rotates across pins for diversity
4. **Brief generator upgrade** — the AI receives the chosen pattern fingerprint as a hard constraint
5. **Pattern checklist scorer** — each rendered pin is scored against the pattern's "must-have" and "must-avoid" rules; failing pins are rejected
6. **Optional research refresh** — admin button that uses Perplexity to pull current top-performing pet Pinterest insights and merges into the library version
7. **Admin Patterns Page** — browse the library, see niche weights, trigger refresh, preview which pattern is in rotation

## Architecture

```text
                pinterest-style-dna  ◄─── existing
                        │
                        ▼
            ┌────────────────────────┐
            │  pinterest-patterns    │  NEW shared lib
            │  • 12 pattern presets  │
            │  • niche → weights map │
            │  • selector + rotation │
            └──────────┬─────────────┘
                       │
                       ▼
       pinterest-creative-director (extended)
       • generate_briefs picks 1 pattern per brief
       • renderScene injects pattern fingerprint
       • qualityCheck adds pattern checklist
                       │
                       ▼
                pinterest_pin_queue (draft)

            ┌────────────────────────┐
            │ pinterest-pattern-     │  NEW edge function
            │   research              │  (optional refresh)
            │  • Perplexity research │
            │  • normalize → patches │
            │  • upsert pattern_lib  │
            └────────────────────────┘
```

## Pattern Library (initial 12)

Each pattern has: id, label, hero psychology, composition rule, typography preference, hook angle, must-have list, must-avoid list, niche affinity weights.

```text
1.  cozy_warm_interior          — luxury apartment, warm light, relief
2.  before_after_transformation — split or sequence, problem → outcome
3.  editorial_minimal           — magazine-style, 70%+ negative space
4.  soft_luxury                 — cream/oat palette, single hero, refined serif
5.  scandi_decor                — white oak, plants, neutral textiles
6.  cinematic_pet_portrait      — shallow DOF, dramatic light, eye-contact
7.  lifestyle_first_subtle_product — pet/owner story, product secondary
8.  emotional_bonding           — owner+pet hands/embrace, intimate framing
9.  adventure_golden_hour       — outdoor, motion, warm light, road/trail
10. cozy_emotional_comfort      — blankets, low light, sleeping pet
11. clean_aspirational_routine  — morning ritual, clean kitchen, hands shown
12. multi_pet_decor             — two cats, decor harmony, calm interaction
```

## Pattern fingerprint shape (TS)

```ts
interface PinterestPattern {
  id: string;                       // 'cozy_warm_interior'
  label: string;
  psychology: string;               // why it works in 1 sentence
  composition_rule: string;         // injected into image prompt
  typography_preference: TypographyKey;
  whitespace: 'high' | 'medium' | 'low';
  cta_placement: 'bottom_subtle' | 'top_minimal' | 'none';
  hook_angle: string;
  must_have: string[];              // checklist for QA
  must_avoid: string[];             // checklist for QA + injected as negative prompt
  niche_affinity: Partial<Record<NicheKey, number>>;  // 0..1
}
```

## Pattern → niche weights (excerpt)

| Niche | Top patterns (weight) |
|---|---|
| cat_litter | clean_aspirational_routine 0.9, soft_luxury 0.8, cozy_warm_interior 0.7 |
| dog_car | adventure_golden_hour 0.95, cinematic_pet_portrait 0.7, emotional_bonding 0.6 |
| cat_tree | scandi_decor 0.95, editorial_minimal 0.8, multi_pet_decor 0.6 |
| dog_harness | adventure_golden_hour 0.95, cinematic_pet_portrait 0.8 |
| calming_bed | cozy_emotional_comfort 0.95, cinematic_pet_portrait 0.7 |
| dog_bed | soft_luxury 0.8, lifestyle_first_subtle_product 0.7 |
| cat_fountain | clean_aspirational_routine 0.8, editorial_minimal 0.7 |

The selector picks a pattern per brief by weighted random + a "no-repeat-within-batch" rule so the N pins for one product hit N different patterns.

## Quality checklist additions

For each rendered pin we add to the existing quality filter:
- All `must_have` keywords present in the brief's `full_prompt` and `environment_summary`
- None of the `must_avoid` keywords present anywhere in brief or headline (e.g. "floating product card", "giant cta", "template", "collage")
- `whitespace` budget enforced via prompt directive ("≥30% of frame is clean negative space" for editorial_minimal etc.)
- Failure → moved to `rejected[]` with the failing rule, not inserted

## Database

New small table — versioned pattern overlays so refreshes don't lose history:

```sql
create table public.pinterest_pattern_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  pattern_id text not null,
  patch jsonb not null,         -- partial PinterestPattern overlay
  source text not null,         -- 'curated' | 'perplexity_refresh'
  notes text,
  created_at timestamptz not null default now()
);
alter table public.pinterest_pattern_versions enable row level security;
create policy "admins manage pattern versions"
  on public.pinterest_pattern_versions for all
  to authenticated using (has_role(auth.uid(),'admin'))
  with check (has_role(auth.uid(),'admin'));
create index on public.pinterest_pattern_versions(pattern_id, version desc);
```

The base library lives in code (`_shared/pinterest-patterns.ts`); the table only stores curated overlays / refresh patches.

## Edge functions

- **Edit** `pinterest-creative-director`
  - In `generate_briefs`: select N patterns (weighted by niche), inject each pattern's fingerprint into the brief request as a hard constraint, and tag every brief with `pattern_id`
  - In `renderScene`: inject `composition_rule` + `must_avoid` (negative directives) into the image prompt
  - In `qualityCheck`: add pattern-checklist scoring; reject failures
  - Return `pattern_id` on every draft
- **New** `pinterest-pattern-research` (optional)
  - actions: `refresh_patterns`, `list_versions`
  - `refresh_patterns`: calls Perplexity (`sonar-pro`, US-domain filter to top DTC pet sources) for "what visual patterns are top US pet brands using on Pinterest in 2026 for {niche}?" — extracts JSON via tool calling, normalizes into pattern patches, upserts into `pinterest_pattern_versions`. NO image scraping.

## Frontend

- **New page** `/admin/pinterest-patterns` (lazy-loaded route)
  - Shows the 12 patterns as cards with: psychology, must-have/must-avoid, niche affinity bars
  - "Refresh patterns from research" button (only renders if Perplexity connector is linked)
  - Recent versions list with diff summary
- **Update** `/admin/pinterest-pin-status`
  - In the AI Creative Director result panel, show `pattern_id` badge per draft thumbnail
  - Add "Pattern" column to the queue table

## Out of scope (explicit)

- No literal scraping of Pinterest pin images, no copying of competitor visuals
- No changes to Pinterest publishing, OAuth, board logic, or cron
- No auto-publish — drafts still require human approval
- Existing Pexels/Cloudinary template path is left untouched
- No new Pinterest API calls

## Rollout

1. Migration for `pinterest_pattern_versions`
2. `_shared/pinterest-patterns.ts` (library + selector)
3. Wire patterns into `pinterest-creative-director`
4. New `/admin/pinterest-patterns` page + lazy route
5. Optional `pinterest-pattern-research` edge function (only if user wants the Perplexity refresh now)
6. Smoke test: generate 5 pins for one cat-litter product and verify each has a different `pattern_id`

## Approval needed

- OK to ship the 12-pattern library above? Add or rename any?
- Build the Perplexity research refresh now (requires the Perplexity connector to be linked), or stub the button as "coming soon" and ship just the curated library this round?
- OK to add the `pattern_id` column to the queue UI? (It will require selecting one extra column in the existing query — no migration.)
