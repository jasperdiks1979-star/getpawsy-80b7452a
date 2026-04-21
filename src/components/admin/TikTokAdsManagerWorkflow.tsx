import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Globe,
  Ban,
  Copy,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Target,
  DollarSign,
  Languages,
  Smartphone,
  Clock,
  Flag,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * TikTok Ads Manager Workflow — US-only Geo Lock
 *
 * Guided checklist that forces the user to configure every TikTok Ads Manager
 * campaign as United States only, with Netherlands explicitly excluded.
 *
 * This is a manual-setup helper (the in-app "Promote" flow defaults to the
 * account region NL — Ads Manager is the only way to override geo).
 */

const ADS_MANAGER_URL = 'https://ads.tiktok.com/i18n/dashboard/';

type StepKey =
  | 'open_ads_manager'
  | 'select_objective'
  | 'set_location_us'
  | 'exclude_nl'
  | 'set_language_en'
  | 'set_demographics'
  | 'set_placement_us'
  | 'set_budget'
  | 'set_schedule_us'
  | 'review_publish';

interface StepDef {
  key: StepKey;
  title: string;
  description: string;
  icon: React.ElementType;
  copyValue?: string;
  requiredText?: string;
}

const STEPS: StepDef[] = [
  {
    key: 'open_ads_manager',
    title: 'Open TikTok Ads Manager (NIET de in-app Promote knop)',
    description:
      'De "Promote" knop in de TikTok app gebruikt automatisch je accountregio (NL). Alleen Ads Manager laat je geo overschrijven.',
    icon: ExternalLink,
  },
  {
    key: 'select_objective',
    title: 'Kies doelstelling: Traffic of Product Sales',
    description:
      'Voor GetPawsy (US dropshipping): kies "Traffic" om naar /products te sturen, of "Product Sales" als je TikTok Shop catalogus al gekoppeld is.',
    icon: Target,
  },
  {
    key: 'set_location_us',
    title: 'Location → ALLEEN United States toevoegen',
    description:
      'In Ad Group settings → Demographics → Location: typ "United States" en selecteer alleen dit land. Verwijder elk ander land dat TikTok suggereert.',
    icon: Globe,
    copyValue: 'United States',
    requiredText: 'United States',
  },
  {
    key: 'exclude_nl',
    title: 'Exclude Locations → Netherlands TOEVOEGEN',
    description:
      'Klik op "Exclude Locations" en voeg Netherlands toe. Dit voorkomt dat TikTok je advertentie ooit aan Nederlandse gebruikers toont, zelfs als ze reizen.',
    icon: Ban,
    copyValue: 'Netherlands',
    requiredText: 'Netherlands',
  },
  {
    key: 'set_language_en',
    title: 'Languages → English (US)',
    description:
      'Selecteer alleen "English". Niet "Dutch" of "All". Hierdoor target je alleen Engelstalige gebruikers in de US.',
    icon: Languages,
    copyValue: 'English',
  },
  {
    key: 'set_demographics',
    title: 'Demographics: Age 25-54, All genders',
    description:
      'Pet owners in US: kernsegment 25-54 jaar, beide geslachten. Vermijd 13-17 (geen koopkracht) en 65+ (lage TikTok-adoptie).',
    icon: Smartphone,
  },
  {
    key: 'set_placement_us',
    title: 'Placement → TikTok only (geen Pangle/News Feed App)',
    description:
      'Schakel Pangle en News Feed App UIT. Die plaatsen reclame buiten TikTok, vaak in low-quality apps die geen US-traffic garanderen.',
    icon: Flag,
  },
  {
    key: 'set_budget',
    title: 'Budget: start met $20-30/dag, daily budget (geen lifetime)',
    description:
      'Daily budget geeft je dagelijkse controle. Begin laag, schaal pas op na 3-5 dagen positieve ROAS.',
    icon: DollarSign,
  },
  {
    key: 'set_schedule_us',
    title: 'Schedule: Dayparting in US Eastern/Pacific tijdzone',
    description:
      'Stel schedule in op US tijdzone (Eastern Time). Beste uren: 6-9 AM ET, 12-3 PM ET, 7-11 PM ET. Vermijd 2-5 AM ET (lage activiteit).',
    icon: Clock,
  },
  {
    key: 'review_publish',
    title: 'Review → controleer "Audience Estimate" toont US bevolking',
    description:
      'Check rechts in Ads Manager: de "Audience Estimate" moet ~200M+ users tonen (US population). Als het onder 50M is, klopt je geo niet.',
    icon: CheckCircle2,
  },
];

const STORAGE_KEY = 'tiktok_ads_us_workflow_state';

function loadState(): Record<StepKey, boolean> {
  if (typeof window === 'undefined') return {} as Record<StepKey, boolean>;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {} as Record<StepKey, boolean>;
  }
}

function saveState(state: Record<StepKey, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function TikTokAdsManagerWorkflow() {
  const [checked, setChecked] = useState<Record<StepKey, boolean>>(loadState());
  const [campaignName, setCampaignName] = useState('GetPawsy_US_Traffic_v1');

  const completedCount = useMemo(
    () => STEPS.filter((s) => checked[s.key]).length,
    [checked],
  );
  const progress = Math.round((completedCount / STEPS.length) * 100);
  const allRequiredChecked = STEPS.every((s) => checked[s.key]);

  const toggle = (key: StepKey) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    saveState(next);
  };

  const resetAll = () => {
    setChecked({} as Record<StepKey, boolean>);
    saveState({} as Record<StepKey, boolean>);
    toast.success('Workflow gereset — klaar voor nieuwe campagne');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} gekopieerd: ${text}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-5 w-5 text-primary" />
            US-Only Campagne Workflow
          </CardTitle>
          <CardDescription>
            Verplichte checklist om elke TikTok Ads Manager campagne te locken op{' '}
            <strong>United States</strong> en{' '}
            <strong className="text-destructive">Netherlands uit te sluiten</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">
                  Voortgang: {completedCount}/{STEPS.length}
                </span>
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={resetAll}>
              Reset
            </Button>
          </div>

          <div>
            <Label htmlFor="campaign-name" className="text-xs">
              Campagne naam (kopieer naar Ads Manager)
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="campaign-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(campaignName, 'Campagnenaam')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Pattern: <code>GetPawsy_US_[Objective]_v[N]</code> → maakt rapportage filterbaar
            </p>
          </div>

          <Button
            asChild
            className="w-full"
            size="sm"
          >
            <a href={ADS_MANAGER_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open TikTok Ads Manager
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Critical Warning */}
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Waarom dit nodig is</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>
            Je TikTok account staat geregistreerd op regio <strong>Netherlands</strong>. De in-app "Promote"
            knop gebruikt deze regio automatisch — je vorige campagnes bereikten daarom NL gebruikers.
          </p>
          <p>
            <strong>Oplossing:</strong> gebruik <strong>alleen Ads Manager</strong> en volg deze checklist
            stap voor stap voordat je publiceert.
          </p>
        </AlertDescription>
      </Alert>

      {/* Steps */}
      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isChecked = !!checked[step.key];
          return (
            <Card
              key={step.key}
              className={`transition-colors ${
                isChecked ? 'bg-muted/40 border-green-500/40' : ''
              }`}
            >
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`step-${step.key}`}
                    checked={isChecked}
                    onCheckedChange={() => toggle(step.key)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        Stap {idx + 1}
                      </Badge>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Label
                        htmlFor={`step-${step.key}`}
                        className={`font-semibold text-sm cursor-pointer ${
                          isChecked ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {step.title}
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{step.description}</p>
                    {step.copyValue && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {step.copyValue}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => copyToClipboard(step.copyValue!, step.title)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* Final confirmation */}
      {allRequiredChecked ? (
        <Alert className="border-primary/50 bg-primary/10">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">
            Workflow compleet — klaar om te publiceren
          </AlertTitle>
          <AlertDescription className="text-xs text-foreground/80">
            Alle 10 verplichte stappen zijn afgevinkt. Klik in Ads Manager op "Submit" om de
            US-only campagne te starten. Houd de eerste 48 uur de "Audience Geographics" tab in de
            gaten — als je daar Nederland ziet verschijnen, pauzeer direct.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Nog niet compleet</AlertTitle>
          <AlertDescription className="text-xs">
            Vink alle {STEPS.length} stappen af voordat je publiceert. Vooral{' '}
            <strong>Stap 3 (Location: US)</strong> en <strong>Stap 4 (Exclude NL)</strong> zijn
            kritiek.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick reference card */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Snelle Referentie — Verplichte Settings</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location:</span>
            <strong className="text-primary">United States (only)</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Exclude:</span>
            <strong className="text-destructive">Netherlands</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Language:</span>
            <strong>English</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Age:</span>
            <strong>25–54</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Placement:</span>
            <strong>TikTok only</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Budget:</span>
            <strong>$20–30/day (daily)</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Timezone:</span>
            <strong>America/New_York</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Currency:</span>
            <strong>USD</strong>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}