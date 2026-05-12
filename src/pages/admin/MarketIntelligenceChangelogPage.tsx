/**
 * MarketIntelligenceChangelogPage — overzicht van de 33 fases van het
 * US Market Intelligence + CTA Cohort Engine epic. Alleen-lezen,
 * leesbaar voor niet-technische stakeholders. Gemount onder
 * /admin/market-intelligence/changelog.
 */
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Phase = {
  n: number;
  title: string;
  what: string;
  why: string;
  group: 'Foundation' | 'Signals & Patterns' | 'Opportunity & Auto-loop' | 'Bandit & Budget' | 'Cohort CTA Engine';
};

const PHASES: Phase[] = [
  // Foundation (1-2)
  { n: 1, group: 'Foundation', title: 'Foundation: 9 mi_* tabellen + admin dashboard',
    what: '9 nieuwe database-tabellen voor trends, concurrenten, recipes, opportunities en aanbevelingen, plus de /admin/market-intelligence pagina met 8 tabs.',
    why: 'Zonder gestructureerde dataopslag kan het systeem niets onthouden of leren.' },
  { n: 2, group: 'Foundation', title: 'Signal Ingestion (intern verkeer)',
    what: 'mi-ingest-internal trekt 30 dagen US-bezoekersactiviteit binnen en zet die om naar trendsignalen.',
    why: 'Eerste databron — interne data is direct beschikbaar en 100% compliance-veilig.' },

  // Signals & Patterns (3-7)
  { n: 3, group: 'Signals & Patterns', title: 'Pattern Extraction + Remix Engine',
    what: 'mi-remix-draft maakt originele copy + visual brief op basis van een recipe en product, zonder ooit assets van anderen te kopiëren.',
    why: 'Schaalbaar nieuwe content genereren zonder copyright-risico.' },
  { n: 4, group: 'Signals & Patterns', title: 'Opportunity Detection + Recommendation Engine',
    what: 'Cross-joint trends × catalogus × concurrentie om gaten te vinden en omzet ze in concrete aanbevelingen.',
    why: 'Het systeem moet niet alleen data verzamelen maar ook zelf kansen herkennen.' },
  { n: 5, group: 'Signals & Patterns', title: 'Seasonal Forecasts + Autorun Scheduler',
    what: '52-weeks vooruitkijken op basis van 365 dagen historie. Scheduler draait alle mi-* functies automatisch.',
    why: 'Seizoenseffecten (kerst, BTS, terug-naar-school) voorspellen voordat ze toeslaan.' },
  { n: 6, group: 'Signals & Patterns', title: 'Auto-Feedback Loop',
    what: 'mi-feedback-loop meet hoe gepubliceerde drafts presteren en versterkt/verzwakt recipes automatisch.',
    why: 'Zonder feedback blijft het systeem dom — dit is de kern van zelflerend gedrag.' },
  { n: 7, group: 'Signals & Patterns', title: 'Recommended Next-Creatives Engine',
    what: 'Rangschikt actief de top-creatives die je vervolgens zou moeten maken op basis van trend × product × recipe-prestatie.',
    why: 'Vertaalt data naar een concrete to-do lijst.' },

  // Opportunity & Auto-loop (8-12)
  { n: 8, group: 'Opportunity & Auto-loop', title: 'Overview-tab met live KPIs',
    what: 'Eerste tab in /admin/market-intelligence: 5 counters, trend-bar chart, 52-week forecast lijn, recipe leaderboard.',
    why: 'Een dashboard zonder dashboard-overzicht is geen dashboard.' },
  { n: 9, group: 'Opportunity & Auto-loop', title: 'Cross-channel Publish Readiness + Auto-promotion',
    what: 'mi-promote-recommendations bepaalt automatisch welke aanbevelingen klaar zijn voor Pinterest/TikTok queues.',
    why: 'Gat tussen "aanbevolen" en "gepubliceerd" overbruggen zonder handwerk.' },
  { n: 10, group: 'Opportunity & Auto-loop', title: 'Compliance & QA Gate',
    what: 'Scant elke draft op verboden marketing-termen ("vet-approved", "miracle", etc.) voordat hij gepubliceerd kan worden.',
    why: 'Eén verboden term = Google Merchant Center ban. Vangnet is non-onderhandelbaar.' },
  { n: 11, group: 'Opportunity & Auto-loop', title: 'Auto-Tune Engine',
    what: 'mi-auto-tune past readiness-threshold, recipe-scores en hook-family multipliers automatisch aan op basis van prestaties.',
    why: 'Vaste drempels werken niet — wat goed is in januari is matig in juli.' },
  { n: 12, group: 'Opportunity & Auto-loop', title: 'Closed-Loop Scaling',
    what: 'mi-bulk-variants pakt de top 5 winnende drafts en maakt er automatisch nieuwe varianten van.',
    why: 'Winnaars exploiteren in plaats van steeds opnieuw uitvinden.' },

  // Bandit & Budget (13-21)
  { n: 13, group: 'Bandit & Budget', title: 'Live A/B Experimentation Layer',
    what: '3 nieuwe tabellen (experiments, variants, results) om varianten gestructureerd tegen elkaar te zetten.',
    why: 'Echte A/B-testing in plaats van gokken.' },
  { n: 14, group: 'Bandit & Budget', title: 'Auto-Create Experiments + Pinterest Analytics',
    what: 'Maakt automatisch nieuwe experimenten aan en haalt Pinterest pin-prestaties binnen.',
    why: 'Meer experimenten = meer winnaars per maand.' },
  { n: 15, group: 'Bandit & Budget', title: 'Multi-Armed Bandit (Cross-Channel)',
    what: 'Slimme algoritme dat budget verdeelt tussen Pinterest en TikTok op basis van marginale ROAS.',
    why: 'Stop met geld verspillen op het zwakkere kanaal — dat doet het algoritme nu.' },
  { n: 16, group: 'Bandit & Budget', title: 'Auto-Pause Underperformers + Budget Guardrails',
    what: 'Pauzeert automatisch hook-arms die slecht presteren en zet plafonds per kanaal.',
    why: 'Voorkomt dat één slecht experiment je hele budget opvreet.' },
  { n: 17, group: 'Bandit & Budget', title: 'Revenue Attribution Loop',
    what: 'Optimalisatie verschuift van CTR naar ROAS — klikken zijn leuk, omzet is het doel.',
    why: 'CTR-winnaars zijn niet altijd omzet-winnaars.' },
  { n: 18, group: 'Bandit & Budget', title: 'Auto-Budget Shifter',
    what: 'mi-budget-shifter verschuift dagelijks budget tussen kanalen op basis van marginale ROAS.',
    why: 'Marktomstandigheden veranderen — budget moet meebewegen.' },
  { n: 19, group: 'Bandit & Budget', title: 'Creative-Fatigue Detector',
    what: 'Detecteert wanneer een creative "moe" wordt (ROAS daalt) en stelt vervanging voor.',
    why: 'Elke creative heeft een houdbaarheidsdatum. Ervoor zijn = geld verdienen.' },
  { n: 20, group: 'Bandit & Budget', title: 'Audience Clustering',
    what: 'mi_audience_clusters tabel + Audience-tab. Groepeert bezoekers in cohorten op basis van gedrag.',
    why: 'Iedereen anders behandelen kan niet — cohorten wel.' },
  { n: 21, group: 'Bandit & Budget', title: 'Cohort-Aware Bandit Boost',
    what: 'Bandit krijgt cohort_weight (0.6) zodat hij rekening houdt met welk cohort de bezoeker is.',
    why: 'Dezelfde creative kan briljant zijn voor cohort A en flop voor cohort B.' },

  // Cohort CTA Engine (22-33)
  { n: 22, group: 'Cohort CTA Engine', title: 'Visitor-Level Personalization',
    what: 'mi-visitor-hook edge function bepaalt voor elke bezoeker uit welk cohort hij komt.',
    why: 'Personalisatie begint met herkenning.' },
  { n: 23, group: 'Cohort CTA Engine', title: 'Cohort-Aware CTA Copy (hardcoded seed)',
    what: 'Per cohort een voorkeur-knoptekst ("smell_pain" → urgentie-tekst).',
    why: 'Eerste laag personalisatie zonder afhankelijk te zijn van data.' },
  { n: 24, group: 'Cohort CTA Engine', title: 'Auto-Learning Cohort Copy',
    what: 'cta_copy_winners_by_hook tabel — systeem leert zelf welke knop-tekst per cohort wint.',
    why: 'Hardcoded gokken is OK voor dag 1, maar leren is beter.' },
  { n: 25, group: 'Cohort CTA Engine', title: 'Admin UI: Cohort Copy Winners',
    what: 'Nieuwe tab in /admin/market-intelligence die alle cohort-winnaars laat zien.',
    why: 'Transparantie — jij moet kunnen zien wat het systeem doet.' },
  { n: 26, group: 'Cohort CTA Engine', title: 'Cohort Copy Pin/Unpin',
    what: 'Knoppen om handmatig een winnaar vast te zetten (overrule het algoritme).',
    why: 'Soms weet jij iets dat de data nog niet weet.' },
  { n: 27, group: 'Cohort CTA Engine', title: 'Wilson Lower Bound Confidence Scoring',
    what: 'Statistische methode om winnaars te kiezen op basis van betrouwbaarheid, niet ruwe CTR.',
    why: '5 klikken op variant A vs 1000 op B is geen eerlijke vergelijking — Wilson lost dat op.' },
  { n: 28, group: 'Cohort CTA Engine', title: 'Auto-Decay (TTL 7 dagen)',
    what: 'Pinned winnaars vervallen automatisch na 7 dagen.',
    why: 'Voorkomt dat oude beslissingen voor altijd blijven hangen.' },
  { n: 29, group: 'Cohort CTA Engine', title: 'Audit Log (cohort_copy_pin_history)',
    what: 'Elke pin/unpin/decay/guardrail-actie wordt gelogd met actor en reden.',
    why: 'Achteraf moet je kunnen reconstrueren waarom iets gebeurd is.' },
  { n: 30, group: 'Cohort CTA Engine', title: 'Per-Cohort Guardrail',
    what: 'Als een cohort-winnaar slechter presteert dan globaal (CTR < 70%), wordt hij geblokkeerd.',
    why: 'Vangnet — bescherm tegen leerfouten.' },
  { n: 31, group: 'Cohort CTA Engine', title: 'Statistical Significance Gate',
    what: 'Alleen promoten als winnaar Wilson-LB > runner-up Wilson-UB. Voorkomt flip-flop.',
    why: 'Stop met elke uur van tekst wisselen op basis van ruis.' },
  { n: 32, group: 'Cohort CTA Engine', title: 'Per-Cohort Exploration Budget (10%)',
    what: '10% van bezoekers krijgt expres een niet-winnende variant te zien (sticky per sessie).',
    why: 'Voorkomt dat je vastroest in een lokaal optimum — blijf alternatieven testen.' },
  { n: 33, group: 'Cohort CTA Engine', title: 'Min-Traffic Gate (40 imps/24u)',
    what: 'Cohorten met te weinig verkeer vallen automatisch terug op de globale winnaar.',
    why: 'Geen beslissingen baseren op flutdata.' },
];

const GROUP_COLORS: Record<Phase['group'], string> = {
  'Foundation': 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  'Signals & Patterns': 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  'Opportunity & Auto-loop': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'Bandit & Budget': 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  'Cohort CTA Engine': 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
};

export default function MarketIntelligenceChangelogPage() {
  const groups = Array.from(new Set(PHASES.map((p) => p.group))) as Phase['group'][];
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">33 Aanpassingen — Market Intelligence Engine</h1>
        <p className="text-muted-foreground">
          Volledig overzicht van het epic dat in deze sessie is opgeleverd. Per fase: wat er
          veranderde, en waarom dat nodig was.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {groups.map((g) => (
            <Badge key={g} variant="secondary" className={GROUP_COLORS[g]}>
              {g} · {PHASES.filter((p) => p.group === g).length}
            </Badge>
          ))}
        </div>
      </header>

      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight border-b pb-2">{g}</h2>
          <div className="grid gap-3">
            {PHASES.filter((p) => p.group === g).map((p) => (
              <Card key={p.n} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {p.n}
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h3 className="font-semibold leading-tight">{p.title}</h3>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Wat:</span> {p.what}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Waarom:</span> {p.why}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <footer className="pt-4 text-xs text-muted-foreground border-t">
        Status: epic afgerond — systeem is productie-klaar en zelflerend. Volgende stappen
        liggen buiten de code (verkeer, ads, e-mail, influencer-seeding).
      </footer>
    </div>
  );
}