/**
 * Admin → TikTok Config form.
 *
 * Lets an admin enter / validate / locally override:
 *   • Pixel ID                (20-char uppercase alphanumeric)
 *   • Events Manager URL      (https://ads.tiktok.com/i18n/events_manager/...)
 *   • Conversion event name   (CompletePayment / Purchase / etc.)
 *
 * Storage: localStorage only (per-browser override). Production keeps
 * using VITE_TIKTOK_PIXEL_ID + the hardcoded fallback when no override
 * is set. This page is purely a debug / staging aid.
 */
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, ExternalLink, RotateCcw, Save } from 'lucide-react';
import {
  ALLOWED_CONVERSION_EVENT_OPTIONS,
  FALLBACK_PIXEL_ID,
  getPixelConfigOverride,
  setPixelConfigOverride,
  validateConversionEvent,
  validateEventManagerUrl,
  validatePixelIdString,
  validateTikTokPixelId,
} from '@/lib/tiktok-pixel-config';

// Strict schema — also enforces length caps so bad paste doesn't blow up storage.
const formSchema = z.object({
  pixelId: z
    .string()
    .trim()
    .max(40, 'Too long')
    .regex(/^[A-Z0-9]{20}$/, 'Must be 20 uppercase alphanumeric characters'),
  eventManagerUrl: z
    .string()
    .trim()
    .max(500, 'Too long')
    .url('Must be a valid URL')
    .refine(
      (v) => /^https:\/\/ads\.tiktok\.com\/i18n\/events_manager(\/|$|\?)/i.test(v),
      'Must point to https://ads.tiktok.com/i18n/events_manager/...',
    ),
  conversionEvent: z
    .string()
    .trim()
    .max(60, 'Too long')
    .refine(
      (v) => (ALLOWED_CONVERSION_EVENT_OPTIONS as readonly string[]).includes(v),
      `Must be one of: ${ALLOWED_CONVERSION_EVENT_OPTIONS.join(', ')}`,
    ),
});

type FieldStatus = { ok: boolean; message: string } | null;

const DEFAULT_EVENT_MGR_URL = 'https://ads.tiktok.com/i18n/events_manager/v2/event/index';

export default function TikTokConfigPage() {
  // Active config (env + override) — read once on mount + after save.
  const [activeConfig, setActiveConfig] = useState(() => validateTikTokPixelId());

  // Form state
  const initialOverride = useMemo(() => getPixelConfigOverride(), []);
  const [pixelId, setPixelId] = useState(initialOverride.pixelId ?? activeConfig.pixelId);
  const [eventManagerUrl, setEventManagerUrl] = useState(
    initialOverride.eventManagerUrl ?? DEFAULT_EVENT_MGR_URL,
  );
  const [conversionEvent, setConversionEvent] = useState(
    initialOverride.conversionEvent ?? 'CompletePayment',
  );

  // Per-field validation status
  const [pixelStatus, setPixelStatus] = useState<FieldStatus>(null);
  const [urlStatus, setUrlStatus] = useState<FieldStatus>(null);
  const [eventStatus, setEventStatus] = useState<FieldStatus>(null);

  // Live-validate as user types
  useEffect(() => setPixelStatus(validatePixelIdString(pixelId)), [pixelId]);
  useEffect(() => setUrlStatus(validateEventManagerUrl(eventManagerUrl)), [eventManagerUrl]);
  useEffect(() => setEventStatus(validateConversionEvent(conversionEvent)), [conversionEvent]);

  const allValid = !!pixelStatus?.ok && !!urlStatus?.ok && !!eventStatus?.ok;

  const handleSave = () => {
    const parsed = formSchema.safeParse({ pixelId, eventManagerUrl, conversionEvent });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message || 'Invalid input');
      return;
    }
    setPixelConfigOverride(parsed.data);
    setActiveConfig(validateTikTokPixelId());
    toast.success('Saved locally — applies on next pixel init / page reload.');
  };

  const handleClear = () => {
    setPixelConfigOverride({});
    setActiveConfig(validateTikTokPixelId());
    setPixelId(import.meta.env.VITE_TIKTOK_PIXEL_ID || FALLBACK_PIXEL_ID);
    setEventManagerUrl(DEFAULT_EVENT_MGR_URL);
    setConversionEvent('CompletePayment');
    toast.success('Local override cleared — env var / fallback is back in control.');
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TikTok Pixel Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Validate and locally override the Pixel ID, Events Manager URL, and conversion event used
          by the TikTok integration. Saved overrides live in your browser only.
        </p>
      </div>

      <Alert>
        <AlertTitle className="flex items-center gap-2">
          Active configuration
          <Badge variant={activeConfig.status === 'ok' ? 'default' : 'destructive'}>
            {activeConfig.status}
          </Badge>
          <Badge variant="outline">source: {activeConfig.source}</Badge>
        </AlertTitle>
        <AlertDescription className="mt-2 font-mono text-xs break-all">
          Pixel ID: {activeConfig.pixelId}
          <br />
          {activeConfig.message}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Form</CardTitle>
          <CardDescription>
            Validation runs as you type. Save stores the override in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldBlock
            label="Pixel ID"
            hint="20 uppercase alphanumeric characters."
            status={pixelStatus}
          >
            <Input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="characters"
              className="font-mono"
              placeholder="D7KDRMBC77U9EB7RJROG"
            />
          </FieldBlock>

          <FieldBlock
            label="Events Manager URL"
            hint="Where you manage this pixel in TikTok Ads Manager."
            status={urlStatus}
            extra={
              urlStatus?.ok && (
                <a
                  href={eventManagerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )
            }
          >
            <Input
              value={eventManagerUrl}
              onChange={(e) => setEventManagerUrl(e.target.value)}
              maxLength={500}
              spellCheck={false}
              type="url"
              className="font-mono text-xs"
              placeholder={DEFAULT_EVENT_MGR_URL}
            />
          </FieldBlock>

          <FieldBlock
            label="Conversion event mapping"
            hint="The TikTok standard event used as your primary conversion."
            status={eventStatus}
          >
            <Select value={conversionEvent} onValueChange={setConversionEvent}>
              <SelectTrigger className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_CONVERSION_EVENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="font-mono">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldBlock>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSave} disabled={!allValid} className="gap-2">
              <Save className="h-4 w-4" />
              Save local override
            </Button>
            <Button onClick={handleClear} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Clear override
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Resolution order: <code>localStorage override</code> →{' '}
            <code>VITE_TIKTOK_PIXEL_ID</code> → hardcoded fallback ({FALLBACK_PIXEL_ID}).
          </p>
          <p>
            Saving here only writes to <code>localStorage</code> on this device. To roll out a
            change to all visitors, set <code>VITE_TIKTOK_PIXEL_ID</code> at build time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldBlock({
  label,
  hint,
  status,
  extra,
  children,
}: {
  label: string;
  hint: string;
  status: FieldStatus;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {extra}
      </div>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
      {status && (
        <p
          className={`text-xs flex items-center gap-1 ${
            status.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          {status.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {status.message}
        </p>
      )}
    </div>
  );
}