import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePasskey } from '@/hooks/usePasskey';
import { toast } from 'sonner';
import { Fingerprint, Loader2, Trash2, Smartphone, Monitor, Laptop } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const PasskeyManager = () => {
  const {
    isSupported,
    isPlatformAuthenticatorAvailable,
    registerPasskey,
    deletePasskey,
    fetchPasskeys,
    passkeys,
    isLoading,
  } = usePasskey();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      if (isSupported()) {
        const available = await isPlatformAuthenticatorAvailable();
        setIsAvailable(available);
        if (available) {
          fetchPasskeys();
        }
      }
    };
    checkAvailability();
  }, [isSupported, isPlatformAuthenticatorAvailable, fetchPasskeys]);

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5" />
            Passkeys / Face ID
          </CardTitle>
          <CardDescription>
            Dit apparaat ondersteunt geen passkeys of biometrische authenticatie.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      await registerPasskey();
      toast.success('Passkey succesvol geregistreerd!');
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Registratie geannuleerd');
      } else {
        toast.error(error.message || 'Registratie mislukt');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDelete = async (passkeyId: string) => {
    try {
      await deletePasskey(passkeyId);
      toast.success('Passkey verwijderd');
    } catch (error: any) {
      toast.error('Kon passkey niet verwijderen');
    }
  };

  const getDeviceIcon = (deviceName: string | null) => {
    if (!deviceName) return <Smartphone className="w-4 h-4" />;
    const lower = deviceName.toLowerCase();
    if (lower.includes('iphone') || lower.includes('android')) {
      return <Smartphone className="w-4 h-4" />;
    }
    if (lower.includes('mac') || lower.includes('windows') || lower.includes('linux')) {
      return <Monitor className="w-4 h-4" />;
    }
    if (lower.includes('ipad')) {
      return <Laptop className="w-4 h-4" />;
    }
    return <Smartphone className="w-4 h-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="w-5 h-5" />
          Passkeys / Face ID / Touch ID
        </CardTitle>
        <CardDescription>
          Gebruik je gezicht of vingerafdruk om snel en veilig in te loggen zonder wachtwoord.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {passkeys.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Geregistreerde passkeys:</p>
                {passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getDeviceIcon(passkey.device_name)}
                      <div>
                        <p className="text-sm font-medium">{passkey.device_name || 'Onbekend apparaat'}</p>
                        <p className="text-xs text-muted-foreground">
                          Toegevoegd {formatDistanceToNow(new Date(passkey.created_at), { addSuffix: true, locale: nl })}
                          {passkey.last_used_at && (
                            <> · Laatst gebruikt {formatDistanceToNow(new Date(passkey.last_used_at), { addSuffix: true, locale: nl })}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Passkey verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Je kunt hierna niet meer inloggen met dit apparaat via Face ID of Touch ID.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(passkey.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Verwijderen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleRegister}
              disabled={isRegistering}
              variant="outline"
              className="w-full gap-2"
            >
              {isRegistering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4" />
              )}
              {passkeys.length > 0 ? 'Nog een apparaat toevoegen' : 'Face ID / Touch ID instellen'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
