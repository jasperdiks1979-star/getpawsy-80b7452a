import { useState } from 'react';
import { Copy, Check, Share2, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Post-purchase referral widget.
 * Shown on order confirmation or in account section.
 * Trust-first: no pressure, just a friendly share option.
 */
export const ReferralShareWidget = ({ customerEmail, customerName }: { customerEmail: string; customerName?: string }) => {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('referral-lookup', {
        method: 'POST',
        body: { email: customerEmail, name: customerName },
      });

      if (error) throw error;
      setReferralCode(data.code);
      if (data.new) toast.success('Your referral code is ready!');
    } catch (err) {
      toast.error('Could not generate referral code');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!referralCode) return;
    const shareUrl = `https://getpawsy.pet?ref=${referralCode}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 3000);
  };

  const shareNative = async () => {
    if (!referralCode || !navigator.share) return;
    try {
      await navigator.share({
        title: 'GetPawsy — Premium Pet Products',
        text: `Use my code ${referralCode} for 10% off your first order at GetPawsy!`,
        url: `https://getpawsy.pet?ref=${referralCode}`,
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="w-5 h-5 text-primary" />
          Share the Love
        </CardTitle>
        <CardDescription>
          Give your friends 10% off their first order — and earn $10 store credit for each referral!
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!referralCode ? (
          <Button onClick={generateCode} disabled={loading} className="w-full gap-2">
            <Gift className="w-4 h-4" />
            {loading ? 'Generating...' : 'Get My Referral Link'}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={`getpawsy.pet?ref=${referralCode}`}
                className="text-sm font-mono bg-background"
              />
              <Button size="icon" variant="outline" onClick={copyCode} className="shrink-0">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2 text-sm" onClick={copyCode}>
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <Button variant="outline" className="flex-1 gap-2 text-sm" onClick={shareNative}>
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Your code: <span className="font-mono font-bold">{referralCode}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
