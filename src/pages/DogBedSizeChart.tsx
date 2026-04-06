import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Home, Ruler, Download, Code, Quote, ArrowRight, Dog } from 'lucide-react';

const BASE_URL = 'https://getpawsy.pet';
const PAGE_URL = `${BASE_URL}/resources/dog-bed-size-chart`;

/* ── Size Data ── */
const SIZE_DATA = [
  {
    size: 'Small',
    dimensions: '18″ × 24″',
    weightRange: 'Up to 25 lbs',
    breeds: ['Chihuahua', 'Pomeranian', 'Yorkshire Terrier', 'Maltese', 'Dachshund (Mini)', 'Shih Tzu'],
    color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  },
  {
    size: 'Medium',
    dimensions: '24″ × 36″',
    weightRange: '25–50 lbs',
    breeds: ['Beagle', 'French Bulldog', 'Cocker Spaniel', 'Border Collie', 'Australian Shepherd', 'Corgi'],
    color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  {
    size: 'Large',
    dimensions: '36″ × 48″',
    weightRange: '50–90 lbs',
    breeds: ['Labrador Retriever', 'Golden Retriever', 'German Shepherd', 'Boxer', 'Husky', 'Standard Poodle'],
    color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  {
    size: 'X-Large',
    dimensions: '48″ × 60″',
    weightRange: '90+ lbs',
    breeds: ['Great Dane', 'Mastiff', 'Saint Bernard', 'Bernese Mountain Dog', 'Newfoundland', 'Irish Wolfhound'],
    color: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
];

const HOW_TO_STEPS = [
  { name: 'Measure nose to tail', text: 'Have your dog lie on their side. Measure from the tip of their nose to the base of their tail in inches.' },
  { name: 'Measure height', text: 'Measure from the floor to the top of their shoulders (withers) while standing.' },
  { name: 'Add 6–12 inches', text: 'Add 6–12 inches to the nose-to-tail measurement. This gives room for stretching and turning.' },
  { name: 'Match to bed size', text: 'Compare the total length to the chart above. Choose the size whose dimensions exceed your adjusted measurement.' },
  { name: 'Consider sleeping style', text: 'Curlers need less space; sprawlers need a size up. If your dog stretches out fully, always size up.' },
];

const FAQS = [
  { question: 'What size dog bed do I need for a 50 lb dog?', answer: 'A 50 lb dog typically needs a medium to large bed (24″×36″ to 36″×48″). Measure your dog nose-to-tail and add 6–12 inches. If your dog likes to stretch out, go with the large.' },
  { question: 'Is it better to get a bigger dog bed?', answer: 'Yes, it\'s generally better to size up rather than down. A bed that\'s too small forces awkward positions that can stress joints. A slightly oversized bed lets your dog stretch, curl, and adjust freely.' },
  { question: 'How do I measure my dog for a bed?', answer: 'Measure nose-to-tail while lying down and floor-to-shoulder while standing. Add 6–12 inches to the length. Match the result to the recommended bed dimensions in our size chart above.' },
  { question: 'Do orthopedic dog beds come in all sizes?', answer: 'Yes, most quality orthopedic dog beds are available in small through extra-large. Memory foam and bolster styles are especially popular for medium and large breeds that benefit from joint support.' },
];

const EMBED_SNIPPET = `<a href="${PAGE_URL}" title="Dog Bed Size Chart – GetPawsy">
  <img src="${BASE_URL}/og-image.png" alt="Dog Bed Size Chart by GetPawsy" width="600" />
</a>
<p>Source: <a href="${PAGE_URL}">Dog Bed Size Chart</a> by <a href="${BASE_URL}">GetPawsy</a></p>`;

/* ── Schema ── */
const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Dog Bed Size Chart – Find the Perfect Fit by Breed & Weight',
  description: 'Interactive dog bed size chart with breed examples. Measure your dog and find the right bed size instantly.',
  image: `${BASE_URL}/og-image.png`,
  author: { '@type': 'Organization', name: 'GetPawsy', url: BASE_URL },
  publisher: { '@type': 'Organization', name: 'GetPawsy', url: BASE_URL, logo: { '@type': 'ImageObject', url: `${BASE_URL}/og-image.png` } },
  datePublished: '2026-02-01',
  dateModified: '2026-02-21',
  mainEntityOfPage: PAGE_URL,
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  })),
};

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Measure Your Dog for a Bed',
  description: 'Step-by-step guide to measuring your dog and choosing the correct bed size.',
  step: HOW_TO_STEPS.map((s, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    name: s.name,
    text: s.text,
  })),
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
    { '@type': 'ListItem', position: 2, name: 'Resources', item: `${BASE_URL}/resources` },
    { '@type': 'ListItem', position: 3, name: 'Dog Bed Size Chart', item: PAGE_URL },
  ],
};

export default function DogBedSizeChart() {
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyEmbed = () => {
    navigator.clipboard.writeText(EMBED_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Layout>
      <Helmet>
        <title>Dog Bed Size Chart (2026) – By Breed & Weight | GetPawsy</title>
        <meta name="description" content="Find the perfect dog bed size with our interactive chart. Covers small to XL breeds with exact dimensions, weight ranges, and measuring tips. Free printable PDF." /><meta property="og:title" content="Dog Bed Size Chart – Find the Perfect Fit | GetPawsy" />
        <meta property="og:description" content="Interactive dog bed size chart covering small to XL breeds. Free printable version included." />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(howToSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <div className="container py-8 md:py-12 max-w-4xl">
        {/* Breadcrumbs */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1"><Home className="h-3.5 w-3.5" /><span className="sr-only sm:not-sr-only">Home</span></Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link to="/products">Products</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Dog Bed Size Chart</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <header className="mb-10">
          <Badge variant="secondary" className="mb-3">Resource Guide</Badge>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">Dog Bed Size Chart – Find the Perfect Fit by Breed &amp; Weight</h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
            Choosing the wrong dog bed size is the #1 reason pet owners return beds. Our interactive size chart helps you find the exact dimensions your dog needs based on breed, weight, and sleeping style — so you buy right the first time.
          </p>
        </header>

        {/* ── Interactive Size Chart ── */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <Ruler className="w-5 h-5 text-primary" /> Dog Bed Size Chart
          </h2>

          {/* Size filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveSize(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${!activeSize ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'}`}
            >
              All Sizes
            </button>
            {SIZE_DATA.map(s => (
              <button
                key={s.size}
                onClick={() => setActiveSize(s.size === activeSize ? null : s.size)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${activeSize === s.size ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'}`}
              >
                {s.size}
              </button>
            ))}
          </div>

          {/* Cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            {SIZE_DATA.filter(s => !activeSize || s.size === activeSize).map(s => (
              <div key={s.size} className={`rounded-2xl border-2 p-6 transition-all ${s.color}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${s.badge}`}>{s.size}</span>
                  <span className="text-sm font-mono font-semibold">{s.dimensions}</span>
                </div>
                <p className="text-sm font-medium mb-3">{s.weightRange}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.breeds.map(b => (
                    <Badge key={b} variant="outline" className="text-xs">{b}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Full Breed Table ── */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Complete Breed-to-Size Reference</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Breed</th>
                  <th className="text-left px-4 py-3 font-semibold">Weight Range</th>
                  <th className="text-left px-4 py-3 font-semibold">Recommended Size</th>
                  <th className="text-left px-4 py-3 font-semibold">Bed Dimensions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {SIZE_DATA.flatMap(s =>
                  s.breeds.map(b => (
                    <tr key={b} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{b}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.weightRange}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}>{s.size}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs">{s.dimensions}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── How to Measure ── */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <Dog className="w-5 h-5 text-primary" /> How to Measure Your Dog for a Bed
          </h2>
          <ol className="space-y-4">
            {HOW_TO_STEPS.map((step, i) => (
              <li key={i} className="flex gap-4 bg-card border rounded-xl p-5">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{i + 1}</span>
                <div>
                  <h3 className="font-semibold mb-1">{step.name}</h3>
                  <p className="text-muted-foreground text-sm">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Supporting Content ── */}
        <section className="mb-12 prose prose-headings:text-foreground prose-headings:font-display max-w-none text-muted-foreground">
          <h2 className="text-foreground">Why Dog Bed Size Matters More Than You Think</h2>
          <p>
            A properly sized dog bed isn't just about comfort — it directly impacts your dog's joint health, sleep quality, and overall well-being. Veterinarians consistently recommend that dogs have enough space to stretch out fully without hanging over the edges, which can create pressure points and worsen conditions like hip dysplasia and arthritis.
          </p>
          <p>
            For puppies, sizing up is especially important. A puppy bed should accommodate their adult size, not just their current dimensions. This is why we recommend checking your breed's expected adult weight in the chart above before purchasing. The small upfront investment in the right size prevents the hassle and cost of replacing undersized beds later.
          </p>
          <h3 className="text-foreground">Which Bed Type Is Best for Your Dog's Size?</h3>
          <p>
            Small breeds (under 25 lbs) thrive in bolster-style beds that create a cozy, enclosed feeling. Medium dogs (25–50 lbs) do well with flat mats or <a href="/collections/memory-foam-dog-beds" className="text-primary hover:underline">memory foam dog beds</a> that offer pressure relief. Large and XL breeds (50+ lbs) benefit most from <a href="/collections/best-orthopedic-dog-beds" className="text-primary hover:underline">orthopedic dog beds</a> with high-density foam cores that support heavy frames without bottoming out.
          </p>
          <p>
            Dogs with anxiety or nesting instincts may prefer <a href="/collections/dog-beds-for-anxiety" className="text-primary hover:underline">calming dog beds</a> with raised edges, while active dogs who overheat should consider elevated or <a href="/collections/waterproof-dog-beds" className="text-primary hover:underline">waterproof dog beds</a> that promote airflow. For large breed owners, our <a href="/collections/best-dog-beds-for-large-dogs" className="text-primary hover:underline">best dog beds for large dogs</a> guide covers options rated for 70 lb+ dogs.
          </p>
          <h3 className="text-foreground">Common Dog Bed Sizing Mistakes</h3>
          <p>
            The most frequent mistake is measuring the dog while standing and buying based on that alone. Dogs need room to stretch, turn around, and change positions overnight. Always add 6–12 inches to your nose-to-tail measurement. Another common error is ignoring sleeping style: a dog that curls into a tight ball can go one size smaller, while a sprawler needs the next size up.
          </p>
          <p>
            For detailed material comparisons between memory foam, polyester fill, and orthopedic gel, check our <a href="/guides/best-dog-bed-materials-explained" className="text-primary hover:underline">dog bed materials guide</a>. And if you're unsure about washing and maintenance, our <a href="/guides/how-to-wash-a-dog-bed-properly" className="text-primary hover:underline">how to wash a dog bed</a> guide covers every fabric type.
          </p>
        </section>

        {/* ── Download / Embed Section ── */}
        <section className="mb-12 grid sm:grid-cols-2 gap-4">
          <div className="bg-card border rounded-2xl p-6 text-center">
            <Download className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-2">Printable Size Chart (PDF)</h3>
            <p className="text-muted-foreground text-sm mb-4">Download our one-page printable dog bed size chart to take measurements at home.</p>
            <Button asChild variant="outline">
              <a href="/dog-bed-size-chart.pdf" download>Download PDF</a>
            </Button>
          </div>
          <div className="bg-card border rounded-2xl p-6">
            <Code className="w-8 h-8 text-primary mx-auto mb-3 block" />
            <h3 className="font-semibold mb-2 text-center">Embed This Chart</h3>
            <p className="text-muted-foreground text-sm mb-3 text-center">Share this chart on your website — just copy the HTML snippet below.</p>
            <pre className="bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto mb-3 border">{EMBED_SNIPPET}</pre>
            <Button variant="outline" size="sm" className="w-full" onClick={copyEmbed}>
              {copied ? '✓ Copied!' : 'Copy Embed Code'}
            </Button>
          </div>
        </section>

        {/* ── Cite This Guide ── */}
        <section className="mb-12 bg-muted/30 rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Quote className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Cite This Guide</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-3">
            If you reference this dog bed size chart in your content, please link back to the original source:
          </p>
          <div className="bg-card border rounded-lg p-4 text-sm font-mono break-all">
            GetPawsy. "Dog Bed Size Chart – Find the Perfect Fit by Breed &amp; Weight." GetPawsy, 2026. <a href={PAGE_URL} className="text-primary hover:underline">{PAGE_URL}</a>
          </div>
          <p className="text-muted-foreground text-xs mt-3">
            We appreciate attribution! Linking back helps us continue creating free pet care resources for dog owners everywhere.
          </p>
        </section>

        {/* ── FAQ ── */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ── Internal Links ── */}
        <section className="grid sm:grid-cols-3 gap-4">
          {[
            { to: '/collections/best-dog-beds-for-large-dogs', label: 'Best Dog Beds for Large Dogs', desc: 'Top-rated picks for 50 lb+ breeds' },
            { to: '/collections/best-orthopedic-dog-beds', label: 'Orthopedic Dog Beds', desc: 'Vet-recommended joint support' },
            { to: '/collections/memory-foam-dog-beds', label: 'Memory Foam Dog Beds', desc: 'Premium pressure relief options' },
          ].map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="group bg-card border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{link.label}</h3>
              <p className="text-xs text-muted-foreground">{link.desc}</p>
              <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">Shop Now <ArrowRight className="w-3 h-3" /></span>
            </Link>
          ))}
        </section>
      </div>
    </Layout>
  );
}
