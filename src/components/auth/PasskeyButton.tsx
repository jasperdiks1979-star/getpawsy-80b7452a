import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { usePasskey } from '@/hooks/usePasskey';
import { toast } from 'sonner';
import { Fingerprint, Loader2 } from 'lucide-react';

interface PasskeyButtonProps {
  email?: string;
  onSuccess?: () => void;
  variant?: 'login' | 'register';
}

export const PasskeyButton = ({ email, onSuccess, variant = 'login' }: PasskeyButtonProps) => {
  const { isSupported, isPlatformAuthenticatorAvailable, authenticateWithPasskey, registerPasskey, isLoading } = usePasskey();
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      if (isSupported()) {
        const available = await isPlatformAuthenticatorAvailable();
        setIsAvailable(available);
      }
    };
    checkAvailability();
  }, [isSupported, isPlatformAuthenticatorAvailable]);

  if (!isAvailable) {
    return null;
  }

  const handleClick = async () => {
    try {
      if (variant === 'login') {
        await authenticateWithPasskey(email);
        toast.success('Ingelogd met Face ID/Touch ID!');
        onSuccess?.();
      } else {
        await registerPasskey();
        toast.success('Passkey succesvol geregistreerd!');
        onSuccess?.();
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('Authenticatie geannuleerd');
      } else if (error.message?.includes('not found')) {
        toast.error('Geen passkey gevonden voor dit account');
      } else {
        toast.error(error.message || 'Er is iets misgegaan');
      }
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Fingerprint className="w-4 h-4" />
      )}
      {variant === 'login' ? 'Login met Face ID / Touch ID' : 'Registreer Face ID / Touch ID'}
    </Button>
  );
};
