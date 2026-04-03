import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle, Shield, Ruler, Home } from 'lucide-react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const SITE = 'https://getpawsy.pet';

const FAQ_ITEMS = [
  { q: 'What furniture do indoor cats need?', a: 'At minimum: a cat tree or climbing structure, a scratching post, a hiding spot (condo or tunnel), and an elevated perch near a window. Optional but recommended: wall-mounted shelves, an interactive feeder, and a dedicated sleeping bed. The goal is to replicate the vertical territory, hiding spots, and hunting opportunities that outdoor cats access naturally.' },
  { q: 'Is cat wall furniture safe?', a: 'Yes, when properly installed. Use heavy-duty wall anchors rated for at least 3× your cat\'s weight. Mount into studs whenever possible — drywall anchors alone are not sufficient for cats over 12 lbs. Follow the manufacturer\'s weight rating and spacing guidelines. Check mounts monthly for loosening.' },
  { q: 'How much does indoor cat furniture cost?', a: 'Budget setups (tree + scratcher + bed): $100–$200. Mid-range (quality tree + wall shelves + condo): $300–$500. Premium/designer (hardwood tree + full wall system + integrated feeders): $500–$1,500+. The most cost-effective approach is a quality cat tree ($150–$300) supplemented with DIY wall shelves.' },
  { q: 'What is the best cat furniture for small apartments?', a: 'Wall-mounted shelves and corner cat trees maximize vertical space without consuming floor area. Look for ceiling-to-floor tension poles, floating wall shelves, and over-door perches. A 48" corner tree with wall shelves provides full climbing territory in under 4 sq ft of floor space.' },
  { q: 'Do cats actually use cat shelves?', a: 'Yes — 85% of cats use wall shelves within the first week when properly placed. Position shelves near windows, at varying heights (24–72 inches), and create a "highway" path between shelves. Start with 2–3 shelves and expand based on your cat\'s preferences. Cats that are already climbers take to shelves immediately.' },
  { q: 'How do I cat-proof my furniture?', a: 'Provide attractive alternatives (sisal posts, corrugated scratchers) near furniture you want to protect. Apply double-sided tape to furniture edges. Use citrus spray as a deterrent. Most importantly: cats scratch furniture because they lack proper scratching surfaces, not out of spite. Add scratching posts within 3 feet of every sofa and chair.' },
  { q: 'What materials are best for cat furniture?', a: 'Frame: solid wood or thick MDF (18mm+). Scratching surfaces: natural sisal rope or sisal fabric. Platforms: plush or sherpa fabric (washable). Avoid: particle board frames, synthetic carpet wrapping (traps claws), and thin MDF under 12mm. For wall shelves, bamboo and solid wood are the most durable and attractive options.' },
  { q: 'How often should I replace cat furniture?', a: 'Cat trees: every 3–5 years (or when posts are shredded through). Sisal rope can be re-wrapped at home for $15–$30. Scratching posts: every 6–12 months for heavy scratchers. Wall shelves: 5–10+ years with proper mounting. Fabric covers and cushions: wash monthly, replace annually.' },
  { q: 'Can I make my own cat wall system?', a: 'Absolutely. IKEA shelves (LACK series) with non-slip mats are the most popular DIY option. Use L-brackets rated for 30+ lbs and mount into studs. Add sisal-wrapped bridges between shelves. Total cost for a 4-shelf system: $40–$80. Ensure all edges are smooth and screws are countersunk to prevent injury.' },
  { q: 'What is modern cat furniture?', a: 'Modern cat furniture blends pet functionality with contemporary interior design. Think: Scandinavian-style wooden trees, minimalist wall-mounted perches, furniture-grade cat condos that look like side tables, and sculptural scratching posts. The trend moved from carpet-covered towers to clean-line, neutral-toned pieces that complement modern homes. Expect to pay 30–50% more than traditional designs for comparable quality.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
    { '@type': 'ListItem', position: 2, name: 'Indoor Cat Furniture Guide', item: `${SITE}/indoor-cat-furniture` },
  ],
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

const ARTICLE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Indoor Cat Furniture Guide 2026 – Modern Design, Wall Systems & Apartment Setups',
  description: 'Complete guide to indoor cat furniture: wall-mounted shelves, modern cat trees, apartment setups, and space-saving solutions for 2026.',
  author: { '@type': 'Person', name: 'GetPawsy Editorial Team' },
  publisher: { '@type': 'Organization', name: 'GetPawsy', url: SITE },
  datePublished: '2026-01-20',
  dateModified: '2026-02-25',
  mainEntityOfPage: `${SITE}/indoor-cat-furniture`,
};

const COMPARISON_DATA = [
  { type: 'Floor Cat Tree', space: '4–9 sq ft', height: '48–72"', install: 'None', cats: '1–3', price: '$80–$300', bestFor: 'All-around solution' },
  { type: 'Wall-Mounted Shelves', space: '0 sq ft', height: 'Custom', install: 'Studs req.', cats: '1–4', price: '$30–$80/shelf', bestFor: 'Small apartments' },
  { type: 'Ceiling-to-Floor Pole', space: '1 sq ft', height: '7–10 ft', install: 'Tension fit', cats: '1–2', price: '$100–$250', bestFor: 'Vertical territory' },
  { type: 'Cat Condo / Hideaway', space: '3–6 sq ft', height: '24–48"', install: 'None', cats: '1–2', price: '$60–$200', bestFor: 'Anxious / senior cats' },
  { type: 'Window Perch', space: '0 sq ft', height: 'Window', install: 'Suction/bracket', cats: '1', price: '$20–$60', bestFor: 'Bird watching / enrichment' },
  { type: 'Cat Bridge / Walkway', space: '0 sq ft', height: 'Custom', install: 'Studs req.', cats: '1–3', price: '$50–$150', bestFor: 'Multi-level highways' },
];

export default function IndoorCatFurnitureGuide() {
  return (
    <Layout>
      <Helmet>
        <title>Indoor Cat Furniture Guide 2026 – Wall Shelves, Modern Trees & Apartment Setups | GetPawsy</title>
        <meta name="description" content="Complete guide to indoor cat furniture for 2026. Modern cat trees, wall-mounted shelves, apartment setups, and space-saving solutions. Expert comparison + 10 FAQ." />
        <link rel="canonical" href={`${SITE}/indoor-cat-furniture`} />
        <script type="application/ld+json">{JSON.stringify(BREADCRUMB_JSONLD)}</script>
        <script type="application/ld+json">{JSON.stringify(FAQ_JSONLD)}</script>
        <script type="application/ld+json">{JSON.stringify(ARTICLE_JSONLD)}</script>
      </Helmet>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Indoor Cat Furniture Guide</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Hero */}
        <header className="mb-10">
          <Badge variant="secondary" className="mb-3">Updated February 2026</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Indoor Cat Furniture Guide — Modern Design, Wall Systems & Apartment Setups
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Your indoor cat needs more than a scratching post. This guide covers every type of indoor cat furniture — from floor-standing cat trees to
            wall-mounted shelf highways and space-saving apartment solutions. We'll show you exactly how to build the perfect indoor territory
            without sacrificing your home's aesthetics.
          </p>
        </header>

        {/* Quick Answer */}
        <section className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Quick Answer</h2>
          <p className="text-muted-foreground">
            Every indoor cat needs at minimum: <strong>one cat tree</strong> (for climbing and scratching), <strong>one hiding spot</strong> (condo or tunnel),
            and <strong>one elevated perch</strong> (near a window). For apartments, wall-mounted shelves provide full climbing territory in zero floor space.
            Budget $150–$400 for a complete setup that meets all feline behavioral needs.
          </p>
        </section>

        {/* Jump Links */}
        <nav className="rounded-lg border p-4 mb-10" aria-label="Table of Contents">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Jump to Section</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              ['#why-furniture', 'Why Indoor Cats Need Furniture'],
              ['#comparison', 'Furniture Type Comparison'],
              ['#wall-systems', 'Wall-Mounted Systems'],
              ['#modern-design', 'Modern / Designer Options'],
              ['#apartments', 'Apartment Setups'],
              ['#multi-cat', 'Multi-Cat Territory Planning'],
              ['#diy', 'DIY Cat Wall on a Budget'],
              ['#faq', 'FAQ (10 Questions)'],
            ].map(([href, label]) => (
              <li key={href}><a href={href} className="text-primary hover:underline flex items-center gap-1"><ArrowRight className="h-3 w-3" />{label}</a></li>
            ))}
          </ul>
        </nav>

        {/* Why Indoor Cats Need Furniture */}
        <section id="why-furniture" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Why Indoor Cats Need Dedicated Furniture</h2>
          <p className="text-muted-foreground mb-4">
            Indoor cats live in an environment that's fundamentally different from what their instincts expect. In nature, cats climb trees for safety,
            scratch bark to maintain claws and mark territory, hide in underbrush to decompress, and perch on elevated points to survey their domain.
            Without indoor equivalents of these environmental features, cats develop stress behaviors: furniture scratching, inappropriate elimination,
            aggression, and obesity.
          </p>
          <p className="text-muted-foreground mb-4">
            The American Association of Feline Practitioners (AAFP) identifies five environmental needs for indoor cats:
          </p>
          <ol className="space-y-3 mb-6 list-decimal list-inside text-muted-foreground">
            <li><strong>Vertical territory</strong> — Climbing structures, shelves, and elevated perches that let cats control height advantage.</li>
            <li><strong>Scratching surfaces</strong> — At least one horizontal and one vertical scratching surface per cat, in sisal or corrugated cardboard.</li>
            <li><strong>Hiding spots</strong> — Enclosed spaces (condos, tunnels, boxes) where cats can retreat when stressed or overstimulated.</li>
            <li><strong>Visual stimulation</strong> — Window perches positioned for bird/wildlife watching, which provides mental enrichment equivalent to outdoor access.</li>
            <li><strong>Separated resources</strong> — In multi-cat homes, each cat needs access to resources without being forced into proximity with other cats.</li>
          </ol>
          <p className="text-muted-foreground">
            Cat furniture isn't a luxury — it's the bare minimum infrastructure for indoor cat welfare. The right setup prevents behavioral problems,
            reduces veterinary costs, and dramatically improves your cat's quality of life. A $200 cat tree investment prevents $2,000+ in furniture damage
            and $500+ in behavioral veterinary consultations.
          </p>
        </section>

        {/* Comparison Matrix */}
        <section id="comparison" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Indoor Cat Furniture Comparison (2026)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-semibold">Type</th>
                  <th className="text-left p-3 font-semibold">Floor Space</th>
                  <th className="text-left p-3 font-semibold">Height</th>
                  <th className="text-left p-3 font-semibold">Install</th>
                  <th className="text-left p-3 font-semibold">Cats</th>
                  <th className="text-left p-3 font-semibold">Price</th>
                  <th className="text-left p-3 font-semibold">Best For</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_DATA.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{row.type}</td>
                    <td className="p-3">{row.space}</td>
                    <td className="p-3">{row.height}</td>
                    <td className="p-3">{row.install}</td>
                    <td className="p-3">{row.cats}</td>
                    <td className="p-3">{row.price}</td>
                    <td className="p-3 text-muted-foreground">{row.bestFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA Block 1 */}
        <div className="rounded-xl bg-accent/50 border p-6 mb-12 text-center">
          <p className="font-semibold mb-2">Browse Our Indoor Cat Furniture Collection</p>
          <p className="text-sm text-muted-foreground mb-4">Cat trees, wall shelves, condos, and scratching solutions — all tested for stability and durability.</p>
          <Link to="/collections/cats" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity">
            Shop Indoor Cat Furniture <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Wall-Mounted Systems */}
        <section id="wall-systems" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Wall-Mounted Cat Shelves — The Space-Saving Revolution</h2>
          <p className="text-muted-foreground mb-4">
            Wall-mounted cat shelves have transformed indoor cat enrichment. By using vertical wall space instead of floor space, you can create an
            entire cat highway system in a studio apartment. The key is creating "routes" — connected paths of shelves, bridges, and perches
            that let cats travel around a room without touching the floor.
          </p>
          
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Ruler className="h-4 w-4 text-primary" /> Planning Your Wall System</h3>
          <ul className="space-y-2 mb-6 text-muted-foreground">
            {[
              'Start height: 24–30 inches above floor (easy jump-on point)',
              'Shelf spacing: 12–18 inches vertically between shelves',
              'Minimum shelf depth: 10 inches for standard cats, 14 inches for large breeds',
              'Maximum gap between shelves: 24 inches horizontal (cats need to reach comfortably)',
              'Always provide at least 2 "exit routes" from any elevated position',
              'Include one enclosed shelf or cubby for hiding',
              'Place the highest shelf near a window for maximum enrichment value',
              'Non-slip surface on all platforms (carpet, cork, or rubber mat)',
            ].map(tip => (
              <li key={tip} className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />{tip}</li>
            ))}
          </ul>

          <h3 className="text-lg font-semibold mb-3">Installation Safety Checklist</h3>
          <p className="text-muted-foreground mb-4">
            Improper installation is the #1 cause of cat shelf failures and injuries. Follow these rules without exception:
          </p>
          <ul className="space-y-2 mb-4 text-muted-foreground">
            {[
              'Mount into wall studs (not drywall alone) — use a stud finder',
              'L-brackets rated for 3× your heaviest cat\'s weight',
              'Counter-sink all screws to prevent paw injury',
              'Test each shelf with 30+ lbs of static weight before allowing cat access',
              'Check all mounts monthly for loosening (cats generate dynamic force from jumping)',
              'Renter-friendly option: floor-to-ceiling tension poles with platform attachments',
            ].map(rule => (
              <li key={rule} className="flex items-start gap-2"><Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />{rule}</li>
            ))}
          </ul>
        </section>

        {/* Modern Design */}
        <section id="modern-design" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Modern Cat Furniture — Design That Doesn't Compromise</h2>
          <p className="text-muted-foreground mb-4">
            The days of carpet-covered towers dominating your living room are over. Modern cat furniture uses clean lines, natural materials
            (solid wood, bamboo, sisal fabric), and neutral tones that integrate with contemporary interior design. The best pieces are
            genuinely functional for cats while being attractive enough to serve as standalone furniture.
          </p>
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Scandinavian Style</h3>
              <p className="text-sm text-muted-foreground">Light wood (birch, pine), minimalist platforms, clean geometry. Blends with IKEA/Nordic interiors. Price: $200–$500 for a tree, $40–$80/shelf.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Mid-Century Modern</h3>
              <p className="text-sm text-muted-foreground">Walnut-toned wood, tapered legs, organic curves. Functions as accent furniture. Price: $300–$800. Limited options but growing market in 2026.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Industrial / Minimalist</h3>
              <p className="text-sm text-muted-foreground">Metal frames, concrete-look bases, neutral fabrics. Extremely durable and easy to clean. Price: $150–$400. Best for households with large/active cats.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Furniture-Integrated</h3>
              <p className="text-sm text-muted-foreground">Cat condos disguised as end tables, bookshelves with cat tunnels, coffee tables with built-in scratchers. Price: $200–$600. Best for small spaces.</p>
            </div>
          </div>
          <p className="text-muted-foreground">
            <strong>Important trade-off:</strong> Modern/designer cat furniture typically costs 30–50% more than traditional designs for comparable functionality.
            You're paying for aesthetics and materials. If budget is your primary concern, a traditional carpet-covered tree provides identical cat enrichment
            at half the price. The cat doesn't care about your interior design — they care about height, stability, and scratching surfaces.
          </p>
        </section>

        {/* Apartments */}
        <section id="apartments" className="mb-12">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Home className="h-6 w-6 text-primary" /> Apartment Cat Furniture Setups</h2>
          <p className="text-muted-foreground mb-4">
            Living in a small apartment doesn't mean your cat gets less enrichment — it means you need to think vertically.
            Here are three proven apartment setups that provide full feline territory in minimal space:
          </p>
          
          <div className="space-y-4 mb-6">
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Studio Setup (400–500 sq ft) — $150–$250</h3>
              <p className="text-sm text-muted-foreground mb-2">One 48" corner cat tree + 3 wall shelves + 1 window perch. Total floor space used: 3 sq ft. Creates a complete vertical circuit from floor to ceiling height.</p>
              <p className="text-xs text-muted-foreground">Best placement: tree in the corner nearest the window, shelves connecting tree to window perch.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">1-Bedroom Setup (500–750 sq ft) — $250–$450</h3>
              <p className="text-sm text-muted-foreground mb-2">One 60" cat tree in living room + 4–5 wall shelves creating a room-spanning highway + window perch in bedroom. Separates activity zones from sleep zones.</p>
              <p className="text-xs text-muted-foreground">Best placement: tree in living room corner, shelf highway along hallway wall, perch on bedroom window.</p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Multi-Cat Apartment (any size, 2+ cats) — $400–$700</h3>
              <p className="text-sm text-muted-foreground mb-2">Two trees in separate rooms + 6+ wall shelves with multiple route options + 2 window perches. Critical: shelves must have 2+ exit routes to prevent one cat from trapping another.</p>
              <p className="text-xs text-muted-foreground">Key rule: no dead-end shelves. Every platform must have at least two ways to leave.</p>
            </div>
          </div>
        </section>

        {/* Multi-Cat Territory */}
        <section id="multi-cat" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Multi-Cat Territory Planning</h2>
          <p className="text-muted-foreground mb-4">
            Multi-cat households need furniture that prevents resource guarding and territorial conflicts. The single most important rule:
            <strong> every elevated position must have at least two escape routes</strong>. Dead-end shelves and single-entry condos create
            ambush points that trigger inter-cat aggression.
          </p>
          <ul className="space-y-2 mb-4 text-muted-foreground">
            {[
              'Provide 1.5× the number of perching spots as cats (3 cats = 5 elevated spots minimum)',
              'Separate key resources (food, litter, sleeping) by at least 6 feet or different rooms',
              'Use wall shelves to create "bypass routes" so cats can navigate without confrontation',
              'Provide both open platforms (for confident cats) and enclosed condos (for submissive cats)',
              'Stagger shelf heights — dominant cats prefer the highest point, submissive cats need mid-height options',
            ].map(rule => (
              <li key={rule} className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />{rule}</li>
            ))}
          </ul>
        </section>

        {/* CTA Block 2 */}
        <div className="rounded-xl bg-accent/50 border p-6 mb-12 text-center">
          <p className="font-semibold mb-2">Complete Your Indoor Cat Setup</p>
          <p className="text-sm text-muted-foreground mb-4">From starter trees to full wall systems — everything your indoor cat needs.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/collections/cat-trees-and-condos" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity">
              Cat Trees & Condos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/collections/cat-litter-boxes" className="inline-flex items-center gap-2 border border-primary text-primary px-5 py-2.5 rounded-lg font-medium hover:bg-primary/5 transition-colors">
              Litter Box Solutions <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* DIY Section */}
        <section id="diy" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">DIY Cat Wall System on a Budget ($40–$100)</h2>
          <p className="text-muted-foreground mb-4">
            You don't need to spend $300+ on a pre-made wall system. Here's how to build a 4-shelf cat highway using IKEA components:
          </p>
          <ol className="space-y-3 list-decimal list-inside text-muted-foreground mb-4">
            <li><strong>Shelves:</strong> 4× IKEA LACK wall shelves (110×26 cm, $15 each) — strong enough for cats up to 20 lbs when mounted into studs.</li>
            <li><strong>Non-slip surface:</strong> Cut carpet remnants or cork tiles to shelf size. Attach with double-sided carpet tape.</li>
            <li><strong>Mounting:</strong> L-brackets (2 per shelf, rated 30+ lbs each), mounted into studs with 3" wood screws. Do NOT use included plastic anchors.</li>
            <li><strong>Layout:</strong> Stagger shelves 14–18 inches apart vertically, offset horizontally so cats jump diagonally (easier and safer than straight up).</li>
            <li><strong>Optional bridge:</strong> Connect two shelves with a sisal-wrapped 2×4 board for a walkway element.</li>
            <li><strong>Safety test:</strong> Stand on each shelf yourself (if you're under 150 lbs) before allowing cat access. If it holds you, it'll hold any cat.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            <strong>Total cost:</strong> $60–$100 including shelves, brackets, screws, and carpet. Build time: 1–2 hours with a drill and stud finder.
          </p>
        </section>

        {/* Internal Links */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">Related Guides & Collections</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['/collections/cat-trees-and-condos', 'Best Cat Trees & Condos 2026'],
              ['/guides/cat-condo-vs-cat-tree-2026', 'Cat Condo vs Cat Tree — Complete Comparison'],
              ['/best-self-cleaning-litter-box-2026', 'Best Self-Cleaning Litter Boxes 2026'],
              ['/collections/cat-litter-boxes', 'Cat Litter Box Solutions'],
              ['/resources/indoor-cat-care', 'Indoor Cat Care Resource Center'],
              ['/collections/all', 'Cat Trees for Large Cats'],
            ].map(([href, label]) => (
              <Link key={href} to={href} className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-lg hover:bg-muted/50">
                <ArrowRight className="h-3 w-3 shrink-0" /> {label}
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          <Accordion type="multiple" className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm font-medium">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Trust Footer */}
        <footer className="border-t pt-6 text-center text-xs text-muted-foreground space-y-1">
          <p>Last updated: February 2026 · Written by the GetPawsy Editorial Team</p>
          <p>
            <Link to="/why-trust-our-reviews" className="text-primary hover:underline">Why Trust Our Reviews</Link>
            {' · '}
            <Link to="/editorial-guidelines" className="text-primary hover:underline">Editorial Guidelines</Link>
          </p>
        </footer>
      </main>
    </Layout>
  );
}
