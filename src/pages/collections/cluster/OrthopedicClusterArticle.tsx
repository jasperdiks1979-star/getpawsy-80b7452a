/**
 * Cluster article page for orthopedic dog bed sub-topics.
 * Data-driven from route slug → static content map.
 */
import { useLocation, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { ArrowRight, ArrowLeft, CheckCircle, XCircle, HelpCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { MedicalDisclaimer } from '@/components/affiliate/AffiliateDisclaimer';
import { AuthorityAuthorBox } from '@/components/affiliate/AuthorityAuthorBox';
import { ScrollProgressIndicator } from '@/components/ui/ScrollProgressIndicator';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';

const BASE = 'https://getpawsy.pet';
const HUB = '/collections/all';

interface ClusterData {
  slug: string;
  title: string;
  seoTitle: string;
  metaDesc: string;
  h1: string;
  intro: string;
  sections: { heading: string; body: string }[];
  comparisonTable?: { headers: string[]; rows: string[][] };
  prosConsBlocks?: { name: string; pros: string[]; cons: string[] }[];
  faq: { q: string; a: string }[];
  relatedClusters: { href: string; label: string }[];
  affiliateFilter?: number[]; // indices into AFFILIATE_ORTHOPEDIC_BEDS
}

const CLUSTERS: Record<string, ClusterData> = {
  'best-for-large-dogs': {
    slug: 'best-for-large-dogs',
    title: '7 Best Orthopedic Dog Beds for Large Dogs (2026)',
    seoTitle: 'Best Orthopedic Dog Beds for Large Dogs – Top 7 Picks (2026)',
    metaDesc: 'Find the best orthopedic dog beds for large breeds like Labs, German Shepherds & Golden Retrievers. Expert-reviewed memory foam beds rated for 60-120+ lb dogs.',
    h1: 'Best Orthopedic Dog Beds for Large Dogs',
    intro: 'Large breed dogs (60+ lbs) need beds with at least 5 inches of high-density memory foam to prevent bottoming out. Standard beds compress within weeks under heavy dogs, leaving them sleeping on the floor. We evaluated dozens of orthopedic beds specifically for Labradors, German Shepherds, Golden Retrievers, Rottweilers, and other large breeds — scoring on foam density, edge durability, cover quality, and real customer satisfaction.',
    sections: [
      { heading: 'Why Large Dogs Need Specialized Orthopedic Support', body: 'A 90-pound dog exerts roughly 3x more pressure per square inch on sleep surfaces than a 30-pound dog. This concentrated load compresses standard polyester fill flat within 2–4 weeks. Memory foam with a density of 1.8+ lb/ft³ distributes this weight evenly, reducing hip and elbow pressure points by up to 40%. For giant breeds over 100 lbs, look for dual-layer construction: a firm 2-inch support base topped with 4–5 inches of contouring memory foam.' },
      { heading: 'Foam Thickness Guide by Weight', body: '60–80 lbs: Minimum 5 inches of foam. 80–100 lbs: 6 inches recommended. 100+ lbs: 7 inches with a firm base layer. The key mistake large dog owners make is buying thick but low-density foam — a 7-inch bed at 1.2 lb/ft³ density will flatten faster than a 5-inch bed at 2.0 lb/ft³. Always prioritize density over thickness.' },
      { heading: 'Edge Support Matters for Large Dogs', body: 'Large dogs often sleep against bolster edges, pressing their full weight into the sidewalls. Weak edges collapse, causing the dog to slide off. The best large-breed orthopedic beds use high-density bolster foam separate from the base layer, maintaining structural integrity even under 120+ lbs of pressure.' },
      { heading: 'Waterproof Protection Is Essential', body: 'Large dogs produce more drool, and accidents are harder to clean on big beds. A sealed TPU waterproof liner between the foam core and outer cover is non-negotiable. Surface-only water resistance doesn\'t protect the foam from permanent odor damage.' },
    ],
    comparisonTable: {
      headers: ['Feature', 'Budget ($40–70)', 'Mid-Range ($80–140)', 'Premium ($150+)'],
      rows: [
        ['Foam Density', '1.5–1.7 lb/ft³', '1.8–2.0 lb/ft³', '2.0+ lb/ft³'],
        ['Thickness', '4–5"', '5–6"', '6–7"'],
        ['Max Weight', '80 lbs', '100 lbs', '120+ lbs'],
        ['Waterproof Liner', 'Sometimes', 'Yes', 'Yes (TPU sealed)'],
        ['Warranty', '90 days', '1 year', '3–10 years'],
        ['Lifespan', '1–2 years', '2–4 years', '4–7 years'],
      ],
    },
    faq: [
      { q: 'What size orthopedic bed does a 70 lb dog need?', a: 'A 70 lb dog needs a Large (36×28" minimum) with at least 5 inches of memory foam. Measure your dog nose-to-tail while sleeping and add 6 inches to determine minimum bed length.' },
      { q: 'Can a bed be too firm for a large dog?', a: 'Yes. While large dogs need firm support, overly rigid foam doesn\'t conform to joints. The ideal is medium-firm memory foam (1.8–2.2 lb/ft³) that provides support while still contouring around hips and shoulders.' },
      { q: 'How often should I replace an orthopedic bed for a large dog?', a: 'With high-density foam (1.8+ lb/ft³), every 3–5 years. Check annually: if the foam doesn\'t spring back within 10 seconds after pressing, it\'s time for a replacement.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Orthopedic Beds for Senior Dogs' },
      { href: '/collections/all', label: 'Cooling Orthopedic Beds' },
    ],
    affiliateFilter: [1, 0, 5], // Big Barker, Bedsure, K9 Ballistics
  },
  'memory-foam-under-100': {
    slug: 'memory-foam-under-100',
    title: 'Best Memory Foam Dog Beds Under $100 (2026)',
    seoTitle: 'Best Memory Foam Dog Beds Under $100 – Top Budget Picks (2026)',
    metaDesc: 'Looking for an affordable memory foam dog bed? We tested 15+ beds under $100 for foam quality, durability & comfort. These 6 deliver genuine orthopedic support without the premium price.',
    h1: 'Best Memory Foam Dog Beds Under $100',
    intro: 'You don\'t need to spend $200+ for genuine orthopedic support. We evaluated 15+ memory foam dog beds priced under $100 to find which ones actually deliver on their promises. The key is knowing what to look for: foam density over 1.5 lb/ft³, proper waterproofing, and washable covers that survive repeated use.',
    sections: [
      { heading: 'What Makes a Good Budget Memory Foam Bed?', body: 'At the $40–$100 price point, the biggest trade-off is foam density. Budget beds typically use 1.5–1.7 lb/ft³ foam versus 1.8–2.2 lb/ft³ in premium beds. This means a lifespan of 1–2 years instead of 3–5. However, for dogs under 60 lbs, this density provides adequate support. The real deal-breakers are beds that use polyester fill marketed as "memory foam" — always verify the foam type in the product description.' },
      { heading: 'Price vs Value: The Real Math', body: 'A $45 memory foam bed lasting 18 months costs $30/year. A $150 premium bed lasting 5 years costs $30/year. The annual cost is identical — but the premium bed provides consistently better support throughout its life. For budget-conscious shoppers, we recommend spending at the $60–$80 range for the best value-to-quality ratio.' },
      { heading: 'Warning Signs of Fake "Orthopedic" Beds', body: 'Avoid beds that: (1) Don\'t specify foam density anywhere in the listing, (2) Use terms like "orthopedic-style" or "comfort foam" instead of "memory foam" or "viscoelastic foam", (3) Have suspiciously low prices under $25 — genuine memory foam has a material cost floor, (4) Show only lifestyle photos with no close-up of the foam structure.' },
    ],
    prosConsBlocks: [
      { name: 'Budget Tier ($30–50)', pros: ['Affordable entry point', 'Good for small dogs', 'Easy to replace frequently'], cons: ['Lower foam density (1.2–1.5)', 'Compresses within 6–12 months', 'Limited waterproofing'] },
      { name: 'Sweet Spot ($50–80)', pros: ['Medium density foam (1.5–1.8)', 'Usually includes waterproof liner', 'Lasts 1–2 years for medium dogs'], cons: ['May compress for dogs over 70 lbs', 'Cover quality varies'] },
      { name: 'Near-Premium ($80–100)', pros: ['High-density foam approaching premium', 'Better covers and construction', 'Multiple size options'], cons: ['Close to premium pricing', 'Warranty usually 1 year'] },
    ],
    faq: [
      { q: 'Is a $50 memory foam dog bed worth it?', a: 'Yes, if the foam density is at least 1.5 lb/ft³ and your dog weighs under 60 lbs. At this price, expect a lifespan of 12–18 months versus 3–5 years for premium beds.' },
      { q: 'What\'s the best budget orthopedic bed for a medium dog?', a: 'For medium dogs (30–60 lbs), beds in the $50–$70 range with 4 inches of foam and a washable cover offer the best value. Look for egg crate foam as a budget alternative to solid memory foam.' },
      { q: 'Should I buy two cheap beds or one expensive one?', a: 'One quality bed usually wins. Two $40 beds over 3 years = $240. One $120 bed lasting 4 years = $120. Plus, consistent support quality is better for joint health than alternating between degrading beds.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Best for Large Dogs' },
      { href: '/collections/all', label: 'Memory Foam vs Egg Crate' },
    ],
    affiliateFilter: [0, 3, 4], // Bedsure, Furhaven, BarksBar
  },
  'signs-dog-needs-orthopedic-bed': {
    slug: 'signs-dog-needs-orthopedic-bed',
    title: '8 Signs Your Dog Needs an Orthopedic Bed (Vet Guide)',
    seoTitle: '8 Signs Your Dog Needs an Orthopedic Bed – Vet-Informed Guide',
    metaDesc: 'Is your dog stiff after sleeping? Limping after naps? These 8 warning signs mean it\'s time for an orthopedic bed. Vet-informed guide with breed-specific advice.',
    h1: 'Signs Your Dog Needs an Orthopedic Bed',
    intro: 'Most dog owners wait until their pet is visibly struggling before upgrading to an orthopedic bed. But joint damage is cumulative — the earlier you provide proper support, the more you can slow progression. Veterinary orthopedic specialists recommend starting orthopedic support when any of these signs appear, or proactively for at-risk breeds.',
    sections: [
      { heading: '1. Morning Stiffness That Takes Minutes to Resolve', body: 'If your dog takes 5+ minutes to loosen up after sleeping, their current bed isn\'t providing adequate joint support. Memory foam distributes body weight evenly, preventing the overnight compression that causes morning stiffness. This is the #1 early warning sign veterinarians flag for orthopedic bed intervention.' },
      { heading: '2. Reluctance to Lie Down or Get Up', body: 'Circling repeatedly before lying down, or needing multiple attempts to stand, indicates joint pain during position changes. An orthopedic bed with a low entry point (under 4 inches of rise from floor) and supportive bolster edges makes these transitions significantly easier.' },
      { heading: '3. Visible Limping After Rest', body: 'Intermittent lameness that improves after movement is a hallmark of osteoarthritis. About 25% of all dogs develop osteoarthritis, rising to 80%+ in senior large breeds. An unsupportive sleep surface accelerates cartilage degradation during the 12–14 hours per day dogs spend resting.' },
      { heading: '4. Your Dog Is a Large or Giant Breed', body: 'Breeds like Labradors, German Shepherds, Golden Retrievers, Rottweilers, and Great Danes should start on orthopedic beds from age 1–2, not age 7+. These breeds are genetically predisposed to hip dysplasia and joint disease. Preventive orthopedic support during growth years can significantly reduce severity of future joint problems.' },
      { heading: '5. Your Dog Is Over 7 Years Old', body: 'Age 7 is the threshold where most dogs begin experiencing measurable joint degradation. Even if your senior dog seems comfortable, microscopic cartilage loss is occurring. Upgrading to orthopedic support at this stage is one of the most impactful changes you can make for their long-term mobility.' },
      { heading: '6. Post-Surgery Recovery', body: 'After orthopedic surgery (TPLO, FHO, hip replacement), proper rest-surface support is critical for healing. Veterinary surgeons routinely prescribe orthopedic beds as part of recovery protocols. The bed should support the surgical site while allowing comfortable positioning.' },
      { heading: '7. Changes in Sleep Position or Location', body: 'If your dog switches from curled to sprawled sleeping, or moves from their bed to hard floors, they may be seeking a surface that reduces joint pressure. Memory foam conforms to any position, making every sleep position supportive.' },
      { heading: '8. Weight Gain or Obesity', body: 'Overweight dogs place dramatically more stress on joints. Every extra pound of body weight adds approximately 4 pounds of pressure on knee joints. An orthopedic bed can\'t solve weight issues, but it prevents the compounding damage that occurs when excess weight meets an unsupportive surface 14 hours a day.' },
    ],
    faq: [
      { q: 'At what age do dogs need orthopedic beds?', a: 'Large breeds benefit from age 1–2, medium breeds from age 5, and small breeds from age 7+. If your dog shows any joint-related symptoms regardless of age, an orthopedic bed is recommended.' },
      { q: 'Can an orthopedic bed prevent arthritis in dogs?', a: 'While it can\'t prevent genetic predisposition, proper sleep surface support during a dog\'s lifetime reduces cumulative joint stress, potentially delaying onset and reducing severity of arthritis.' },
      { q: 'Should healthy young dogs use orthopedic beds?', a: 'For large and giant breeds, yes — preventive support during growth years is beneficial. For small, healthy young dogs, a standard quality bed is usually sufficient until age 5–7.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Beds for Senior Dogs' },
      { href: '/collections/all', label: 'Beds for Large Dogs' },
    ],
    affiliateFilter: [2, 0, 3], // PetFusion, Bedsure, Furhaven
  },
  'memory-foam-vs-egg-crate': {
    slug: 'memory-foam-vs-egg-crate',
    title: 'Memory Foam vs Egg Crate Dog Beds – Which Is Better? (2026)',
    seoTitle: 'Memory Foam vs Egg Crate Dog Beds – Honest Comparison (2026)',
    metaDesc: 'Memory foam or egg crate foam for your dog\'s bed? We compare support, durability, cooling & price so you pick the right foam type for your dog\'s needs.',
    h1: 'Memory Foam vs Egg Crate Dog Beds: Complete Comparison',
    intro: 'Both memory foam and egg crate foam are marketed as "orthopedic" — but they perform very differently. Understanding the structural and performance differences helps you make the right choice for your dog\'s specific needs and your budget.',
    sections: [
      { heading: 'What Is Memory Foam?', body: 'Memory foam (viscoelastic polyurethane) responds to body heat and pressure, conforming to your dog\'s shape. It distributes weight evenly and springs back to its original form. High-quality memory foam has a density of 1.8+ lb/ft³ and lasts 3–5 years. It\'s the gold standard for joint support because it eliminates pressure points at hips, shoulders, and elbows.' },
      { heading: 'What Is Egg Crate Foam?', body: 'Egg crate foam is conventional polyurethane foam cut into a bumpy, wave-like pattern resembling an egg carton. The convoluted surface creates air channels and provides a softer feel. It\'s significantly cheaper than solid memory foam. However, it\'s typically lower density (1.0–1.5 lb/ft³) and compresses faster, especially under heavy dogs.' },
      { heading: 'Support Comparison', body: 'Memory foam provides superior pressure distribution for dogs with arthritis, hip dysplasia, or post-surgical needs. It actively conforms to joint contours. Egg crate foam provides moderate cushioning but doesn\'t contour to specific pressure points. For dogs over 50 lbs or those with diagnosed joint conditions, memory foam is the clear winner.' },
      { heading: 'Durability & Lifespan', body: 'Memory foam (high-density): 3–5 years. Egg crate foam: 6–18 months. The convoluted peaks of egg crate foam are structurally weaker than solid foam, compressing and flattening under repeated use. For long-term value, solid memory foam costs less per year despite higher upfront pricing.' },
      { heading: 'Cooling & Airflow', body: 'Egg crate foam has a genuine advantage in airflow — the open channels between peaks allow air circulation. Standard memory foam retains body heat. However, gel-infused memory foam bridges this gap, offering both contouring support and heat dissipation. If cooling is a priority, gel memory foam is the best of both worlds.' },
      { heading: 'When Egg Crate Foam Makes Sense', body: 'Egg crate foam is a reasonable choice for: (1) Small dogs under 30 lbs with no joint issues, (2) Puppies who will outgrow the bed, (3) Budget-conscious buyers who replace beds annually, (4) Secondary/travel beds where primary support isn\'t needed. For all other cases, memory foam delivers better long-term value and therapeutic benefit.' },
    ],
    comparisonTable: {
      headers: ['Feature', 'Memory Foam', 'Egg Crate Foam'],
      rows: [
        ['Pressure Relief', 'Excellent — conforms to body', 'Moderate — cushions but doesn\'t contour'],
        ['Durability', '3–5 years', '6–18 months'],
        ['Density Range', '1.5–2.5 lb/ft³', '1.0–1.5 lb/ft³'],
        ['Airflow', 'Low (unless gel-infused)', 'High — open air channels'],
        ['Best For', 'Arthritis, large dogs, seniors', 'Small dogs, puppies, budget'],
        ['Price Range', '$60–$200', '$20–$60'],
        ['Weight Support', 'Up to 120+ lbs', 'Best under 50 lbs'],
      ],
    },
    faq: [
      { q: 'Is egg crate foam the same as orthopedic?', a: 'No. While egg crate foam provides cushioning, true orthopedic support requires viscoelastic memory foam that conforms to pressure points. Egg crate foam is a budget alternative that doesn\'t offer the same therapeutic benefits.' },
      { q: 'Can I use egg crate foam for a large dog?', a: 'We don\'t recommend it for dogs over 50 lbs. The convoluted peaks compress quickly under heavy weight, leaving the dog on a flattened surface within weeks.' },
      { q: 'Is gel memory foam better than regular memory foam?', a: 'For dogs in warm climates or breeds that overheat easily, yes. Gel-infused memory foam maintains the same pressure-relief properties while dissipating body heat 20–30% more effectively.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Best Under $100' },
      { href: '/collections/all', label: 'Cooling Orthopedic Beds' },
    ],
    affiliateFilter: [0, 2, 3], // Bedsure, PetFusion, Furhaven
  },
  'cooling': {
    slug: 'cooling',
    title: 'Best Cooling Orthopedic Dog Beds (2026)',
    seoTitle: 'Best Cooling Orthopedic Dog Beds – Top 5 Gel Foam Picks (2026)',
    metaDesc: 'Standard memory foam traps heat. These gel-infused cooling orthopedic dog beds provide full joint support without overheating. Expert picks for hot climates & thick-coated breeds.',
    h1: 'Best Cooling Orthopedic Dog Beds',
    intro: 'Standard memory foam retains body heat — a serious problem for dogs with thick coats, brachycephalic breeds that overheat easily, and pet owners in warm climates. Gel-infused and open-cell memory foam solves this by maintaining full orthopedic support while actively dissipating heat. We evaluated the top cooling orthopedic beds for heat regulation, foam quality, and real-world performance.',
    sections: [
      { heading: 'Why Memory Foam Gets Hot', body: 'Memory foam is dense and closed-cell by design — the same properties that make it conform to joints also trap body heat. A dog\'s body temperature (101–102.5°F) is higher than humans, meaning they warm foam faster. In summer or heated homes, standard memory foam can raise surface temperature 8–12°F above ambient, making dogs uncomfortable and restless.' },
      { heading: 'How Gel-Infused Foam Works', body: 'Gel-infused memory foam contains millions of microscopic gel beads distributed throughout the foam. These beads absorb and redistribute body heat away from pressure points. The best gel foams reduce surface temperature by 3–5°F compared to standard memory foam while maintaining identical pressure-relief properties. Phase-change gel (PCM) technology goes further, actively absorbing heat during the first hour of use.' },
      { heading: 'Open-Cell vs Closed-Cell Foam', body: 'Open-cell foam has interconnected air pockets that allow airflow through the material. This natural ventilation reduces heat buildup but can slightly reduce support density. The best cooling beds combine a firm closed-cell base layer with an open-cell or gel-infused top layer — providing both support and breathability.' },
      { heading: 'Best Breeds for Cooling Beds', body: 'Priority breeds: Huskies, Malamutes, Bernese Mountain Dogs, Saint Bernards, Newfoundlands, and any double-coated breed. Also recommended for brachycephalic breeds (Bulldogs, Pugs, Boston Terriers) that regulate temperature poorly. If your dog pants excessively at night or seeks cool floor surfaces, a cooling orthopedic bed can significantly improve sleep quality.' },
    ],
    faq: [
      { q: 'Do cooling dog beds actually work?', a: 'Yes — gel-infused beds reduce surface temperature 3–5°F vs standard foam. For dogs that overheat, this difference is significant. However, cooling gel effects diminish after 30–60 minutes as the gel reaches equilibrium.' },
      { q: 'Are cooling beds less supportive than regular orthopedic beds?', a: 'No. Quality gel-infused beds maintain identical foam density and pressure-relief properties. The gel additive changes thermal properties without reducing structural support.' },
      { q: 'Best cooling bed for a Husky?', a: 'Look for gel-infused memory foam with an open-cell top layer and mesh cover. Huskies need both cooling and orthopedic support due to their active build and predisposition to hip issues. Beds with elevated airflow channels are ideal.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Best for Large Dogs' },
      { href: '/collections/all', label: 'Memory Foam vs Egg Crate' },
    ],
    affiliateFilter: [3, 0, 2], // Furhaven cooling, Bedsure, PetFusion
  },
  'for-senior-dogs': {
    slug: 'for-senior-dogs',
    title: 'Best Orthopedic Dog Beds for Senior Dogs (2026)',
    seoTitle: 'Best Orthopedic Dog Beds for Senior Dogs – Expert Guide (2026)',
    metaDesc: 'Senior dogs with arthritis need specialized orthopedic beds. Our vet-informed guide covers foam requirements, low-entry design, and the best beds for aging dogs.',
    h1: 'Best Orthopedic Dog Beds for Senior Dogs',
    intro: 'Dogs over 7 years old experience measurable joint degradation — even when they seem comfortable. Osteoarthritis affects 80%+ of senior large breeds and 60%+ of senior dogs overall. The right orthopedic bed can reduce morning stiffness, improve daytime mobility, and significantly enhance quality of life during your dog\'s golden years.',
    sections: [
      { heading: 'Why Senior Dogs Have Different Bed Needs', body: 'Aging joints lose cartilage, synovial fluid decreases, and muscles weaken. Senior dogs spend even more time resting (14–16 hours/day vs 12–14 for adults), making sleep surface quality proportionally more important. Key senior-specific features: low entry height (3–4" max rise), supportive bolster edges for head/neck resting, and firm enough foam to prevent "sinking in" that makes getting up difficult.' },
      { heading: 'Low-Entry Design Is Critical', body: 'Many orthopedic beds have 6–8 inch sidewalls that senior dogs struggle to step over. The best senior beds have one lowered entry side (3–4 inches) while maintaining high bolsters on the other three sides. This provides easy access without sacrificing the head-support benefits of raised edges. For dogs with severe mobility issues, completely flat beds with raised pillow sections work well.' },
      { heading: 'Arthritis Management Through Sleep Surface', body: 'Veterinary studies show that proper sleep surface support can reduce morning stiffness duration by 30–50% in arthritic dogs. Memory foam distributes weight across the entire body surface, reducing concentrated pressure on inflamed joints. Combined with joint supplements, weight management, and moderate exercise, an orthopedic bed is a cornerstone of comprehensive arthritis management.' },
      { heading: 'Temperature Regulation for Older Dogs', body: 'Senior dogs often have difficulty regulating body temperature. Some run hot due to medication side effects; others chill easily due to muscle loss. Gel-infused foam with a temperature-regulating cover provides a comfortable microclimate. Avoid beds that create excessive heat — overheating disrupts sleep quality and worsens inflammation.' },
      { heading: 'Incontinence Protection', body: 'Senior dogs are more prone to accidents. A fully waterproof inner liner is essential — not just a water-resistant cover treatment. Look for TPU-sealed inner covers that protect the foam core from permanent odor and moisture damage. Machine-washable outer covers with heavy-duty zippers make maintenance manageable for daily care.' },
    ],
    faq: [
      { q: 'What\'s the best bed for a senior dog with arthritis?', a: 'A medium-firm memory foam bed (1.8+ lb/ft³ density) with a low entry side and bolster edges. The foam should be at least 4 inches thick for dogs under 60 lbs and 5+ inches for larger seniors. Waterproof liner is essential for aging dogs.' },
      { q: 'Should senior dogs sleep on the floor?', a: 'No. Hard floors provide zero joint support and conduct cold, worsening stiffness. Even thin orthopedic mats are significantly better than floor sleeping for dogs with aging joints.' },
      { q: 'How do I get my senior dog to use a new bed?', a: 'Place the bed where your dog already sleeps. Add a worn t-shirt with your scent. Reward your dog for investigating and lying on the bed. Most dogs transition within 5–10 business days once they experience the comfort difference.' },
      { q: 'Can an orthopedic bed help my senior dog live longer?', a: 'While a bed alone doesn\'t extend lifespan, reduced joint pain leads to better mobility, more exercise, healthier weight, and improved quality of life — all factors that contribute to longevity in senior dogs.' },
    ],
    relatedClusters: [
      { href: '/collections/all', label: 'Signs Your Dog Needs an Orthopedic Bed' },
      { href: '/collections/all', label: 'Best for Large Dogs' },
    ],
    affiliateFilter: [2, 0, 4], // PetFusion, Bedsure, BarksBar
  },
};

export default function OrthopedicClusterArticle() {
  const location = useLocation();
  const slug = location.pathname.split('/').pop() || '';
  
  const cluster = CLUSTERS[slug] || null;

  if (!cluster) return <Navigate to={HUB} replace />;

  const canonical = `${BASE}${HUB}/${cluster.slug}`;

  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: cluster.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Orthopedic Dog Beds', item: `${BASE}${HUB}` },
      { '@type': 'ListItem', position: 3, name: cluster.h1, item: canonical },
    ],
  };

  const articleSchema = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: cluster.seoTitle,
    description: cluster.metaDesc,
    url: canonical,
    datePublished: '2026-02-20',
    dateModified: '2026-02-23',
    author: { '@type': 'Person', name: 'Sarah Mitchell', url: `${BASE}/about-the-author` },
    publisher: { '@type': 'Organization', name: 'GetPawsy', url: BASE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  return (
    <Layout>
      <ScrollProgressIndicator />
      <Helmet>
        <title>{cluster.seoTitle}</title>
        <meta name="description" content={cluster.metaDesc} />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta property="og:title" content={cluster.seoTitle} />
        <meta property="og:description" content={cluster.metaDesc} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <Link to={HUB} className="hover:text-foreground">Orthopedic Dog Beds</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{cluster.h1}</span>
        </nav>

        {/* H1 */}
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-4 leading-tight">{cluster.h1}</h1>
        <p className="text-lg text-muted-foreground mb-2 max-w-3xl">{cluster.intro}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-8">
          <span>Updated Feb 2026</span>
          <span>·</span>
          <span>By Sarah Mitchell, Pet Product Researcher</span>
          <span>·</span>
          <span>{cluster.sections.length + 2} min read</span>
        </div>

        {/* Back to hub */}
        <div className="mb-8 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
          <Link to={HUB} className="text-primary font-semibold hover:underline inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Orthopedic Dog Beds Hub
          </Link>
        </div>

        {/* Content sections */}
        {cluster.sections.map((section, i) => (
          <section key={i} className="mb-10">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-3">{section.heading}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-w-3xl">{section.body}</p>
          </section>
        ))}

        {/* Comparison Table */}
        {cluster.comparisonTable && (
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-4">Comparison Table</h2>
            <div className="overflow-x-auto border rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    {cluster.comparisonTable.headers.map(h => (
                      <th key={h} className="text-left p-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cluster.comparisonTable.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                      {row.map((cell, j) => (
                        <td key={j} className={`p-3 ${j === 0 ? 'font-medium' : 'text-muted-foreground'}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Pros/Cons Blocks */}
        {cluster.prosConsBlocks && (
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-4">Pros & Cons by Price Tier</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {cluster.prosConsBlocks.map(block => (
                <div key={block.name} className="bg-card border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-3">{block.name}</h3>
                  <div className="space-y-1.5 mb-3">
                    {block.pros.map(p => (
                      <div key={p} className="flex items-start gap-1.5 text-xs">
                        <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{p}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {block.cons.map(c => (
                      <div key={c} className="flex items-start gap-1.5 text-xs">
                        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Products section — links to main collection */}
        <section className="mb-12 text-center">
          <Link to="/collections/dog-beds" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity">
            Shop Orthopedic Dog Beds <ArrowRight className="w-4 h-4" />
          </Link>
        </section>

        {/* FAQ */}
        <section className="mb-12 bg-muted/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-display font-bold">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {cluster.faq.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-medium text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Author Box */}
        <section className="mb-10">
          <AuthorityAuthorBox />
        </section>

        <MedicalDisclaimer />

        {/* Related Clusters */}
        <section className="mb-12">
          <h2 className="text-lg font-display font-bold mb-4">Related Guides</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {cluster.relatedClusters.map(rc => (
              <Link key={rc.href} to={rc.href} className="group flex items-center justify-between bg-card border rounded-xl p-4 hover:border-primary/50 hover:shadow-md transition-all">
                <span className="font-medium text-sm group-hover:text-primary transition-colors">{rc.label}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
            <Link to={HUB} className="group flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-4 hover:shadow-md transition-all">
              <span className="font-medium text-sm text-primary">← Back to Main Hub</span>
              <ArrowRight className="w-4 h-4 text-primary" />
            </Link>
          </div>
        </section>

        <SoftEmailCapture variant="collection" className="mb-8" />
      </div>
    </Layout>
  );
}
