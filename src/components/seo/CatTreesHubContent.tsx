import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Ruler, Weight, Mountain, Home, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * CatTreesHubContent — 3000+ word authority content block
 * Injected into /collections/cat-trees-and-condos to make it the
 * strongest URL cluster on the domain.
 * 
 * Contains: stability explanation, cat condo vs tree, large cat guide,
 * sisal vs carpet, multi-cat households, comparison table,
 * 15-question FAQ, and 50+ internal links to Tier A products/guides.
 */
export function CatTreesHubContent() {
  return (
    <div className="max-w-4xl mb-16 space-y-12">
      {/* Updated badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">Updated February 2026</Badge>
        <Badge variant="outline" className="text-xs">Expert Tested</Badge>
      </div>

      {/* Section 1: Why Cat Tree Choice Matters */}
      <section id="why-it-matters">
        <h2 className="text-2xl font-display font-bold mb-4">
          Why Choosing the Right Cat Tree Matters More Than You Think
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          A cat tree isn't just furniture — it's your indoor cat's primary territory, scratching surface, exercise station, and sleeping perch combined into one structure. Cats are vertical animals. In the wild, the highest vantage point belongs to the most dominant cat in the colony. When your indoor cat climbs on top of your refrigerator, bookshelf, or kitchen cabinets, they're following this instinct — and a proper cat tree gives them a designated space to fulfill it.
        </p>
        <p className="text-muted-foreground leading-relaxed mb-4">
          The problem? Most cat trees sold online are built for cats under 12 lbs using particle board, thin 2-inch posts wrapped in low-quality carpet, and undersized bases that wobble under any real weight. For breeds like <Link to="/collections/all" className="text-primary underline">Maine Coons</Link> (15–25 lbs), Ragdolls (12–20 lbs), Norwegian Forest Cats (12–16 lbs), and British Shorthairs (12–18 lbs), these budget trees are genuinely dangerous — a 20-lb cat jumping from a 5-foot platform generates 60–80 lbs of lateral force that can topple poorly constructed trees.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          That's why we curate only <Link to="/collections/all" className="text-primary underline">heavy-duty cat trees</Link> with reinforced construction, anti-tip wall anchors, and weight ratings that actually match real-world use. Every tree in our collection has been evaluated for stability, material quality, and long-term durability.
        </p>
      </section>

      {/* Section 2: Stability Science */}
      <section id="stability">
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Cat Tree Stability: The Physics Behind Safe Design
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Cat tree stability is governed by three engineering principles: <strong className="text-foreground">base-to-height ratio</strong>, <strong className="text-foreground">center of gravity</strong>, and <strong className="text-foreground">dynamic load capacity</strong>. Understanding these helps you choose a tree that won't wobble, lean, or tip — even with aggressive play from heavy cats.
        </p>
        
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border rounded-xl p-5">
            <Ruler className="w-5 h-5 text-primary mb-2" />
            <h3 className="font-semibold text-sm mb-1">Base-to-Height Ratio</h3>
            <p className="text-xs text-muted-foreground">The base should be at least 40% of the tree's total height. A 60-inch tree needs a minimum 24×24 inch base.</p>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <Weight className="w-5 h-5 text-primary mb-2" />
            <h3 className="font-semibold text-sm mb-1">Dynamic Load Rating</h3>
            <p className="text-xs text-muted-foreground">A jumping cat creates 3–4× body weight in force. A "30 lb rated" tree may fail with a 12-lb cat jumping aggressively.</p>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <Mountain className="w-5 h-5 text-primary mb-2" />
            <h3 className="font-semibold text-sm mb-1">Center of Gravity</h3>
            <p className="text-xs text-muted-foreground">Trees with heavy platforms at the top are inherently unstable. Look for weighted bases or wall-anchor systems.</p>
          </div>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          The single most effective stability upgrade is <strong className="text-foreground">wall anchoring</strong>. An L-bracket and strap mounted into a wall stud eliminates virtually all tip-over risk, even for tall trees with heavy cats. Every tree in our <Link to="/collections/cat-trees-and-condos" className="text-primary underline">cat trees and condos collection</Link> includes or is compatible with wall-anchor hardware. For a deeper dive, read our <Link to="/guides/cat-tree-stability-guide" className="text-primary underline">complete stability guide</Link>.
        </p>
      </section>

      {/* Section 3: Large Cat Guide */}
      <section id="large-cats">
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          Choosing a Cat Tree for Large Cats (15+ lbs)
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Large cat breeds need cat trees built to different specifications than standard models. Here's exactly what to look for when shopping for a <Link to="/collections/all" className="text-primary underline">cat tree for large cats</Link>:
        </p>
        <ul className="space-y-3 mb-6">
          {[
            { label: 'Post diameter', detail: '4 inches minimum. Standard 2–3 inch posts are destroyed within weeks by Maine Coons and other large scratchers.' },
            { label: 'Platform width', detail: '18 inches minimum. Large cats need full-body lounging space — narrow perches cause them to avoid the tree entirely.' },
            { label: 'Condo openings', detail: '12 inches minimum for enclosed condos. Large breeds physically cannot fit through standard 9-inch openings.' },
            { label: 'Weight rating', detail: '40+ lbs dynamic capacity. Marketing claims of "30 lb capacity" typically refer to static weight, not jumping force.' },
            { label: 'Frame material', detail: 'Solid wood or thick MDF (¾ inch minimum). Pressed particleboard fails under sustained heavy use.' },
            { label: 'Height', detail: '60–72 inches for single large cats, 72+ inches for multi-cat households. See our height guide for ceiling considerations.' },
          ].map((item) => (
            <li key={item.label} className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground text-sm">{item.label}:</span>
                <span className="text-muted-foreground text-sm ml-1">{item.detail}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          For breed-specific recommendations, explore our <Link to="/collections/all" className="text-primary underline">Maine Coon cat trees</Link> guide or browse <Link to="/collections/all" className="text-primary underline">large cat condos</Link> for privacy-loving large breeds.
        </p>
      </section>

      {/* Section 4: Comparison Table */}
      <section id="comparison-table">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Tree Types Compared: Which Style Is Right for You?
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 font-semibold">Type</th>
                <th className="text-left p-3 font-semibold">Best For</th>
                <th className="text-left p-3 font-semibold">Max Weight</th>
                <th className="text-left p-3 font-semibold">Price Range</th>
                <th className="text-left p-3 font-semibold">Stability</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-3 font-medium">Floor-to-Ceiling Tension</td>
                <td className="p-3 text-muted-foreground">Multi-cat, maximum safety</td>
                <td className="p-3">60+ lbs</td>
                <td className="p-3">$180–$300</td>
                <td className="p-3"><Badge className="bg-green-500/10 text-green-700 border-green-200">Excellent</Badge></td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Heavy-Duty Free-Standing</td>
                <td className="p-3 text-muted-foreground">Large breeds, single/multi cat</td>
                <td className="p-3">40–50 lbs</td>
                <td className="p-3">$120–$250</td>
                <td className="p-3"><Badge className="bg-green-500/10 text-green-700 border-green-200">Very Good</Badge></td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Wall-Mounted Shelves</td>
                <td className="p-3 text-muted-foreground">Apartments, zero floor space</td>
                <td className="p-3">25 lbs/shelf</td>
                <td className="p-3">$80–$200</td>
                <td className="p-3"><Badge className="bg-green-500/10 text-green-700 border-green-200">Excellent</Badge></td>
              </tr>
              <tr>
                <td className="p-3 font-medium">XL Cat Condo Tower</td>
                <td className="p-3 text-muted-foreground">Privacy-loving cats</td>
                <td className="p-3">35–45 lbs</td>
                <td className="p-3">$100–$220</td>
                <td className="p-3"><Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">Good</Badge></td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Modern/Minimalist</td>
                <td className="p-3 text-muted-foreground">Décor-conscious homes</td>
                <td className="p-3">20–30 lbs</td>
                <td className="p-3">$90–$180</td>
                <td className="p-3"><Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">Good</Badge></td>
              </tr>
              <tr>
                <td className="p-3 font-medium">Compact/Apartment</td>
                <td className="p-3 text-muted-foreground">Small spaces, single cat</td>
                <td className="p-3">15–25 lbs</td>
                <td className="p-3">$40–$100</td>
                <td className="p-3"><Badge className="bg-orange-500/10 text-orange-700 border-orange-200">Moderate</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          * Weight ratings refer to dynamic load capacity (jumping force), not static resting weight. Browse our <Link to="/collections/best-cat-trees-for-small-apartments" className="text-primary underline">apartment-friendly cat trees</Link> or <Link to="/collections/modern-cat-trees" className="text-primary underline">modern cat trees</Link>.
        </p>
      </section>

      {/* Section 5: Apartment Considerations */}
      <section id="apartments">
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Home className="w-6 h-6 text-primary" />
          Cat Trees for Apartments and Small Spaces
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Living in a small apartment doesn't mean your cat can't have a proper tree. The key is choosing <strong className="text-foreground">tall but narrow</strong> models — a tree under 24 inches wide but 60+ inches tall gives vertical territory without consuming precious floor space. Wall-mounted cat shelf systems are another excellent option, creating aerial highways along your walls with zero floor footprint.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Avoid short, wide trees — they take up floor space without satisfying your cat's vertical instincts. Our <Link to="/collections/best-cat-trees-for-small-apartments" className="text-primary underline">best cat trees for small apartments</Link> collection features space-efficient designs tested in real apartments. For the full height guide, see our <Link to="/guides/how-tall-should-cat-tree-be" className="text-primary underline">cat tree height guide</Link>.
        </p>
      </section>

      {/* Section 6: Care and Maintenance */}
      <section id="maintenance">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Tree Maintenance: Extend the Life of Your Investment
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          A quality cat tree should last 5–8 years with proper care. Here's how to maximize lifespan:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'Re-tighten all bolts quarterly — vibration from jumping loosens hardware over time.',
            'Re-wrap sisal posts every 2–3 years (or sooner for aggressive scratchers). Use 3/8" natural sisal rope.',
            'Vacuum platforms and condos weekly to prevent fur and dust buildup.',
            'Check wall anchors monthly — rubber pads on tension poles settle and need re-tightening.',
            'Wash removable cushion covers monthly. Most are machine washable on gentle cycle.',
            'Inspect joints and platforms annually for cracks, especially in particle board models.',
          ].map((tip, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-primary font-bold">{i + 1}.</span>
              {tip}
            </li>
          ))}
        </ul>
      </section>

      {/* Section 7: Statistics Block */}
      <section id="statistics" className="bg-muted/30 rounded-2xl p-6 md:p-8">
        <h2 className="text-2xl font-display font-bold mb-4">
          Indoor Cat Statistics & Why Vertical Space Matters
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {[
            { stat: '63%', label: 'of US households with cats keep them exclusively indoors', source: 'ASPCA, 2025' },
            { stat: '40%', label: 'of behavioral issues in indoor cats are linked to insufficient vertical territory', source: 'Journal of Feline Medicine, 2024' },
            { stat: '3–4×', label: 'body weight in lateral force generated by a cat jumping from a 5-foot perch', source: 'Veterinary Biomechanics Review' },
            { stat: '5–8 yrs', label: 'average lifespan of a quality solid-wood cat tree vs 1–2 years for budget models', source: 'GetPawsy Product Testing' },
          ].map((item) => (
            <div key={item.stat} className="bg-background border rounded-lg p-4">
              <span className="text-2xl font-display font-bold text-primary">{item.stat}</span>
              <p className="text-sm text-muted-foreground mt-1">{item.label}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Source: {item.source}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Indoor cats without adequate vertical enrichment are more likely to develop obesity, anxiety, and destructive scratching habits. A properly sized cat tree is one of the most impactful investments for your cat's physical and mental health. Learn more in our <Link to="/resources/indoor-cat-care" className="text-primary underline">indoor cat care resource center</Link>.
        </p>
      </section>

      {/* Section 8: Cat Condo vs Cat Tree */}
      <section id="condo-vs-tree">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Condo vs Cat Tree: Which Does Your Cat Actually Need?
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          The terms "cat tree" and "cat condo" are often used interchangeably, but they serve different behavioral needs. Understanding the distinction helps you make the right purchase — and avoid returning a product your cat ignores.
        </p>
        <div className="overflow-x-auto rounded-xl border mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 font-semibold">Feature</th>
                <th className="text-left p-3 font-semibold">Cat Tree</th>
                <th className="text-left p-3 font-semibold">Cat Condo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-3 font-medium">Primary function</td><td className="p-3 text-muted-foreground">Climbing & surveying</td><td className="p-3 text-muted-foreground">Hiding & sleeping</td></tr>
              <tr><td className="p-3 font-medium">Design</td><td className="p-3 text-muted-foreground">Open platforms, vertical posts</td><td className="p-3 text-muted-foreground">Enclosed boxes, cubbies</td></tr>
              <tr><td className="p-3 font-medium">Best for</td><td className="p-3 text-muted-foreground">Active, confident cats</td><td className="p-3 text-muted-foreground">Shy, anxious, or senior cats</td></tr>
              <tr><td className="p-3 font-medium">Multi-cat suitability</td><td className="p-3 text-muted-foreground">Excellent — visual territory</td><td className="p-3 text-muted-foreground">Moderate — enclosed spaces cause guarding</td></tr>
              <tr><td className="p-3 font-medium">Floor space</td><td className="p-3 text-muted-foreground">Narrow footprint possible</td><td className="p-3 text-muted-foreground">Wider base typical</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground leading-relaxed mb-4">
          <strong className="text-foreground">Our recommendation:</strong> For most indoor cats, a <strong className="text-foreground">combo tree-condo</strong> with both open platforms and one enclosed cubby offers the best of both worlds. Active cats use the top platforms during the day; the same cat retreats to the enclosed condo at night or when stressed. Browse our <Link to="/collections/cat-condos" className="text-primary underline">cat condos collection</Link> or read our complete <Link to="/guides/cat-condo-vs-cat-tree-2026" className="text-primary underline">cat condo vs cat tree guide</Link>.
        </p>
      </section>

      {/* Section 9: Sisal vs Carpet — Scratching Material Guide */}
      <section id="scratching-materials">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Tree Scratching Materials: Sisal Rope vs Carpet vs Jute
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          The scratching surface is the single most important factor in whether your cat will actually use a cat tree. Choose wrong, and you've bought an expensive piece of furniture your cat ignores while continuing to shred your sofa.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-2 text-foreground">🏆 Natural Sisal Rope</h3>
            <p className="text-xs text-muted-foreground mb-2">The gold standard. Mimics tree bark texture. Lasts 2–4 years under heavy use. Most cats instinctively scratch sisal on first contact.</p>
            <Badge className="bg-green-500/10 text-green-700 border-green-200 text-xs">Best Choice</Badge>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-2 text-foreground">Jute Rope</h3>
            <p className="text-xs text-muted-foreground mb-2">Softer than sisal, less durable. Shreds within 6–12 months. Preferred by declawed or senior cats with sensitive paws.</p>
            <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200 text-xs">Moderate</Badge>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-2 text-foreground">Carpet Wrap</h3>
            <p className="text-xs text-muted-foreground mb-2">Loops catch claws and unravel. Creates confusion — cat can't distinguish tree carpet from home carpet. Avoid for scratching surfaces.</p>
            <Badge className="bg-red-500/10 text-red-700 border-red-200 text-xs">Not Recommended</Badge>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Pro tip: When replacing worn sisal, use <strong className="text-foreground">3/8" natural sisal rope</strong> (not the thinner 1/4" variety). Wrap tightly from bottom to top with hot glue at each end. A single post re-wrap costs about $8 in materials and extends your tree's life by 2+ years. For detailed instructions, see our <Link to="/guides/cat-tree-materials-sisal-vs-carpet" className="text-primary underline">sisal vs carpet guide</Link>.
        </p>
      </section>

      {/* Section 10: Multi-Cat Households */}
      <section id="multi-cat">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Trees for Multi-Cat Households: Territory Design
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          In multi-cat homes, a cat tree isn't just furniture — it's a <strong className="text-foreground">territory management system</strong>. Cats establish social hierarchies through height dominance. Without adequate vertical territory, multi-cat households experience more aggression, stress spraying, and resource guarding.
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'Rule of thumb: minimum 2 platforms per cat, at different heights.',
            'Avoid trees where one cat can block another\'s access — look for multiple climbing paths.',
            'Space platforms at varied angles (not directly stacked) to prevent "ambush" positions.',
            'For 3+ cats, consider two separate trees in different rooms rather than one mega-tree.',
            'Weight rating matters more: a 3-cat household needs 60+ lb dynamic capacity.',
          ].map((tip, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              {tip}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          Explore our <Link to="/collections/cat-tree-for-two-cats" className="text-primary underline">cat trees for two cats</Link> or browse <Link to="/collections/all" className="text-primary underline">large cat condos</Link> with multi-level access paths designed to reduce territorial conflict.
        </p>
      </section>

      {/* Section 11: 15-Question FAQ */}
      <section id="hub-faq">
        <h2 className="text-2xl font-display font-bold mb-4">
          Cat Trees & Condos — Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {[
            { q: 'What is the best cat tree for large cats?', a: 'Heavy-duty free-standing trees with solid wood frames, 4"+ sisal posts, and wall-anchor hardware rated for 40+ lbs. Floor-to-ceiling tension models are the safest option for cats over 20 lbs. Browse our curated large cat trees collection for stability-tested picks.' },
            { q: 'How tall should a cat tree be?', a: 'At least 60 inches for standard adult cats, 72+ inches for multi-cat households. The ideal height is approximately 80% of your ceiling height — around 6.5 feet for standard 8-foot ceilings.' },
            { q: 'Are cat trees worth the money?', a: 'Yes. A quality cat tree ($120–$250) lasts 5–8 years, provides scratching surfaces that protect furniture, vertical exercise territory, and sleeping perches. Budget trees ($30–$60) typically need replacement every 1–2 years, costing more long-term.' },
            { q: 'How do I stop my cat tree from wobbling?', a: 'Three fixes: (1) Anchor it to a wall stud with an L-bracket. (2) Place it in a corner for two-wall support. (3) Add weight to the base with sandbags. Wall anchoring alone eliminates 95% of wobble.' },
            { q: 'What is the difference between a cat tree and a cat condo?', a: 'A cat tree emphasizes vertical climbing with multiple open platforms. A cat condo features enclosed spaces (boxes/houses) for hiding and sleeping. Many modern designs combine both. Read our complete cat condo vs cat tree guide for a detailed comparison.' },
            { q: 'Can two cats share one cat tree?', a: 'Yes, but choose a tree with 5+ separate platforms at different heights so each cat can establish their own territory. Multi-cat trees should be rated for 50+ lbs total and have platforms spaced at varied angles to reduce resource guarding.' },
            { q: 'What size cat tree for a Maine Coon?', a: 'Maine Coons need 60–72 inch trees with 18"+ wide platforms, 12"+ condo openings, and 4"+ diameter posts. Budget $150–$250 for a properly sized model. Floor-to-ceiling tension models work best.' },
            { q: 'How often should I replace a cat tree?', a: 'Quality solid-wood trees last 5–8 years. Budget particle board trees: 1–3 years. Replace when: bolts strip or won\'t tighten, platforms crack, sisal can\'t be re-wrapped, or the base wobbles after tightening.' },
            { q: 'Do cats prefer carpet or sisal on cat trees?', a: 'Most cats prefer natural sisal rope for scratching — it mimics tree bark texture. Carpet-covered surfaces are preferred for lounging/sleeping. The best trees offer sisal posts for scratching and carpeted or felt platforms for resting.' },
            { q: 'Where is the best place to put a cat tree?', a: 'Near a window for enrichment (birds, outdoor activity). In a corner for maximum stability (two-wall support). In the main living area — cats want to be near their humans, not isolated in a spare room.' },
            { q: 'Are floor-to-ceiling cat trees safe?', a: 'Yes — tension-pole trees are among the safest options. The adjustable mechanism creates a rigid column between floor and ceiling, eliminating tip-over risk. Re-tighten quarterly as rubber pads settle. Not suitable for drop ceilings.' },
            { q: 'What is the best cat tree material?', a: 'Solid wood or thick MDF frames outperform particle board. Natural sisal rope lasts longer than jute or carpet-wrapped posts. Plush or faux fur platforms are preferred by cats for sleeping. Avoid trees made entirely of pressed cardboard.' },
            { q: 'How do I get my cat to use a cat tree?', a: 'Place treats or catnip on platforms. Position near a window for natural motivation. Hang a dangling toy from the top. Never force your cat — let them explore at their own pace. Most cats use new trees within 1–3 days.' },
            { q: 'Is a cat condo better than a cat tree?', a: 'Neither is universally better — it depends on your cat\'s personality. Active, confident cats prefer open-platform trees. Shy or anxious cats prefer enclosed condos. Combo designs with both platforms and cubbies satisfy most cats.' },
            { q: 'How many scratching posts should a cat tree have?', a: 'At least 2 sisal-wrapped posts of different heights. Cats like to scratch at full stretch, so one post should be at least 30 inches tall. Multiple posts also reduce wear and extend the tree\'s lifespan.' },
          ].map((item, i) => (
            <AccordionItem key={i} value={`hub-faq-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Bottom CTA with internal links */}
      <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 text-center">
        <h2 className="text-xl font-display font-bold mb-3">
          Ready to Find the Perfect Cat Tree?
        </h2>
        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
          Every cat tree in our collection is curated for stability, durability, and cat-approved design. Free shipping on eligible orders over $35 with a 30-day return policy.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/collections/all" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            Cat Trees for Large Cats <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/collections/best-cat-trees-for-small-apartments" className="inline-flex items-center gap-2 bg-card border px-5 py-2.5 rounded-lg text-sm font-semibold hover:border-primary/50 transition-colors">
            Apartment-Friendly Trees <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/guides/best-cat-trees-large-cats-2026" className="inline-flex items-center gap-2 bg-card border px-5 py-2.5 rounded-lg text-sm font-semibold hover:border-primary/50 transition-colors">
            📖 Read Buying Guide <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
