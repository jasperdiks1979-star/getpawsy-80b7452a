import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Mail, Save, Loader2, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export const GooglebotNotificationSettings = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const { data: setting, isLoading } = useQuery({
    queryKey: ['site-settings', 'googlebot_notification_email'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('key', 'googlebot_notification_email')
        .single();

      if (error) throw error;
      return data;
    },
    meta: {
      onSuccess: (data: { value: string }) => {
        setEmail(data?.value || '');
      }
    }
  });

  // Set initial email when data loads
  useState(() => {
    if (setting?.value && !email) {
      setEmail(setting.value);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await supabase
        .from('site_settings')
        .update({ value: newEmail })
        .eq('key', 'googlebot_notification_email');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      setHasChanges(false);
      toast({
        title: 'Instellingen opgeslagen',
        description: 'Het notificatie email adres is bijgewerkt.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fout bij opslaan',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setHasChanges(value !== setting?.value);
  };

  const handleSave = () => {
    if (!email || !email.includes('@')) {
      toast({
        title: 'Ongeldig email adres',
        description: 'Voer een geldig email adres in.',
        variant: 'destructive',
      });
      return;
    }
    updateMutation.mutate(email);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Googlebot Notificaties</CardTitle>
        </div>
        <CardDescription>
          Configureer het email adres waar notificaties naartoe worden gestuurd wanneer Googlebot je appeal pagina's bezoekt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notification-email">Notificatie Email</Label>
            <div className="flex gap-2">
              <Input
                id="notification-email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={handleSave}
                disabled={!hasChanges || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasChanges ? (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Opslaan
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Opgeslagen
                  </>
                )}
              </Button>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium mb-1">Wanneer worden notificaties verstuurd?</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Googlebot bezoekt <code className="bg-muted px-1 rounded">/google-review</code></li>
              <li>AdsBot-Google bezoekt <code className="bg-muted px-1 rounded">/technical-declaration</code></li>
              <li>Google-InspectionTool bezoekt <code className="bg-muted px-1 rounded">/appeal-response</code></li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
