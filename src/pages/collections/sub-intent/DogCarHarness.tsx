import { SubIntentPage } from '@/components/seo/SubIntentPage';

export default function DogCarHarness() {
  return (
    <SubIntentPage
      canonical="https://getpawsy.pet/collections/all"
      title="Best Dog Car Harnesses – Crash Tested Safety (2026)"
      metaDesc="Shop crash-tested dog car harnesses that clip to your vehicle's seat belt. Padded chest plates, reinforced stitching. Best for dogs 30+ lbs."
      h1="Best Dog Car Harnesses — Crash-Tested Restraint for Safe Travel (2026)"
      subtitle="Crash-tested harness systems that attach directly to your vehicle's seat belt. Padded chest plates distribute impact forces. Ideal for medium and large dogs 30+ lbs."
      ctaText="Shop Car Harnesses"
      ctaLink="/collections/best-dog-car-seats"
      trustBadges={['Crash-Test Informed', '5–10 Day US Shipping', '30-Day Return Policy']}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Dog', href: '/collections/all' },
        { label: 'Dog Car Travel Safety', href: '/collections/all' },
        { label: 'Car Harnesses' },
      ]}
      pillarLink={{ label: 'Dog Car Travel Safety Guide', href: '/collections/all' }}
      productQuery="name.ilike.%car harness%,name.ilike.%seat belt%dog%,name.ilike.%dog harness%car%"
      contentBlocks={[
        {
          heading: 'Why Car Harnesses Beat Regular Leashes',
          body: `A regular walking harness or leash provides zero crash protection. In a 30 mph collision, a walking harness concentrates all force on narrow straps that can cause serious neck, chest, and spinal injuries.

A properly designed car harness distributes impact force across a wide padded chest plate — similar to how a human seat belt works. The harness clips to the vehicle's seat belt system, creating a direct connection to the car's engineered restraint points.

Critical difference: Walking harnesses are designed to prevent pulling. Car harnesses are designed to absorb and distribute crash forces. They are fundamentally different products with different engineering requirements.`,
        },
        {
          heading: 'What "Crash Tested" Really Means',
          body: `The Center for Pet Safety (CPS) is the leading US organization for pet travel safety testing. Their crash tests use weighted crash test dummies in standardized sled tests simulating 30 mph frontal impacts.

A CPS-certified harness has been proven to:
• Keep the dog restrained during impact (no ejection)
• Distribute crash forces across the chest plate (no point-loading)
• Maintain structural integrity (no strap or buckle failure)
• Allow the dog to be safely removed post-crash

Products without CPS certification or equivalent testing may restrain during normal driving but haven't been proven to protect during actual collisions. Look for specific crash-test documentation, not vague "safety tested" claims.`,
        },
        {
          heading: 'Sizing and Fit Guide',
          body: `Proper fit is critical — a loose harness provides no crash protection.

Chest measurement: Wrap a tape measure around the widest part of the chest, just behind the front legs. Add 1 inch for comfort.

Neck measurement: Measure around the base of the neck where the collar sits.

The harness should be snug enough that you can fit only 2 fingers between the harness and the dog's body. Loose harnesses allow the dog to slip out during impact.

Size recommendations:
• Small (20–35 lbs): Pugs, French Bulldogs, Beagles
• Medium (35–60 lbs): Border Collies, Australian Shepherds
• Large (60–90 lbs): Labs, Golden Retrievers, German Shepherds
• XL (90+ lbs): Great Danes, Mastiffs, Rottweilers`,
        },
      ]}
      faq={[
        { question: 'Are dog car harnesses safe?', answer: 'Crash-tested car harnesses from reputable brands are the safest restraint option for medium and large dogs (30+ lbs). They distribute impact forces across a wide chest plate and connect directly to the vehicle\'s seat belt system. Always choose harnesses with documented crash-test results over generic "safety" claims.' },
        { question: 'Can I use a walking harness as a car harness?', answer: 'No. Walking harnesses are designed to prevent pulling and have narrow straps that concentrate force. In a crash, they can cause serious chest, neck, and spinal injuries. Car harnesses have wide padded chest plates specifically engineered to distribute crash forces safely.' },
        { question: 'How do I attach a dog car harness?', answer: 'Thread the vehicle seat belt through the harness\'s designated belt loop, then buckle the seat belt normally. Some harnesses use a separate tether that clips to the seat belt latch. Never attach a car harness to a headrest — only use the vehicle\'s engineered seat belt anchor points.' },
      ]}
      relatedArticles={[
        { slug: 'best-orthopedic-dog-bed', title: 'Recovery Comfort at Home', desc: 'Memory foam beds for rest after road trips.' },
      ]}
      crossLinks={[
        { label: 'Dog Car Safety Hub', href: '/collections/all' },
        { label: 'Dog Car Seats', href: '/collections/all' },
        { label: 'Dog Booster Seats', href: '/collections/all' },
      ]}
    />
  );
}
