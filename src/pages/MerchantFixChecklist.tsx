import { Helmet } from 'react-helmet-async';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';

const steps = [
  {
    title: 'Feed URL configuratie',
    items: [
      'Primary feed URL: https://getpawsy.pet/merchant-feed.xml',
      'Feed type: RSS 2.0 met Google Shopping namespace',
      'Schedule: Dagelijks ophalen instellen in Merchant Center',
    ],
  },
  {
    title: 'Image accessibility',
    items: [
      'Alle image_link URLs zijn absolute https:// URLs',
      'Fallback placeholder: https://getpawsy.pet/images/merchant-placeholder.jpg',
      'HEAD-request check: alle images moeten 200 OK + Content-Type: image/* retourneren',
      'Valideer via: POST /validate-merchant-feed edge function',
    ],
  },
  {
    title: 'Shipping weight normalisatie',
    items: [
      'Elk product heeft <g:shipping_weight> (1–25 kg)',
      'Null/0/NaN → default 1 kg',
      'Grams (≥100) automatisch geconverteerd naar kg',
      'Grote producten (cat tree, dog bed, XL etc.) minimum 5 kg',
      'Maximum cap: 25 kg',
    ],
  },
  {
    title: 'Shipping instellingen in Merchant Center',
    items: [
      'Land: United States',
      'Bezorgservice: Standard (5–10 business days)',
      'Gratis verzending boven $35 (komt overeen met feed)',
      'Flat rate $5.99 onder $35',
      'Processing time: 1–3 business days',
    ],
  },
  {
    title: 'Trust & Policy pagina\'s',
    items: [
      '/contact — Bedrijfsnaam, email, support uren',
      '/shipping — Verzendbeleid, levertijden, tracking',
      '/returns — 30-dagen retourbeleid, proces, refund timeline',
      '/privacy — GDPR & CCPA compliant privacybeleid',
      '/terms — Algemene voorwaarden',
      'Alle pagina\'s gelinkt in footer en indexable',
    ],
  },
  {
    title: 'Misrepresentation check',
    items: [
      'Geen nep-urgentie timers of stock counters',
      'Geen medische claims voor dierproducten',
      'Geen "guaranteed results" of "official" taalgebruik',
      'Prijzen in feed = prijzen op website',
      'Canonical URLs gebruiken https://getpawsy.pet (geen www)',
      'Feed URLs matchen product URLs exact',
    ],
  },
  {
    title: 'Herbeoordeling aanvragen',
    items: [
      'Feed opnieuw ophalen in Merchant Center',
      'Wacht tot feed volledig verwerkt is (check diagnostics)',
      'Ga naar Account issues → Request review',
      'Voeg toelichting toe: "Fixed shipping weights, image validation, and policy pages"',
      'Herbeoordeling duurt doorgaans 5–10 werkdagen',
    ],
  },
];

export default function MerchantFixChecklist() {
  return (
    <>
      <Helmet>
        <title>Merchant Center Fix Checklist | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Layout>
      <main className="min-h-screen bg-background py-12">
        <div className="container max-w-3xl px-4">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Merchant Center Fix Checklist
          </h1>
          <p className="text-muted-foreground mb-8">
            Volg deze stappen om de Merchant Center opschorting op te heffen.
            Vraag een nieuwe beoordeling aan zodra de feed herverwerkt is.
          </p>

          <div className="space-y-8">
            {steps.map((section, idx) => (
              <div key={idx} className="bg-card rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  {section.title}
                </h2>
                <ul className="space-y-2">
                  {section.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm text-foreground font-medium">
              🔗 Validatie endpoint:{' '}
              <a
                href={`https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/validate-merchant-feed`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                /validate-merchant-feed <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>
      </main>
      </Layout>
    </>
  );
}
