import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PasskeyCredential {
  id: string;
  credential_id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

// Base64URL encoding/decoding utilities
function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export const usePasskey = () => {
  const { user, session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);

  // Check if WebAuthn is supported
  const isSupported = useCallback(() => {
    return !!(
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential === 'function'
    );
  }, []);

  // Check if platform authenticator (Face ID, Touch ID) is available
  const isPlatformAuthenticatorAvailable = useCallback(async () => {
    if (!isSupported()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }, [isSupported]);

  // Fetch user's registered passkeys
  const fetchPasskeys = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('passkey_credentials')
      .select('id, credential_id, device_name, created_at, last_used_at')
      .eq('user_id', user.id);

    if (!error && data) {
      setPasskeys(data);
    }
  }, [user]);

  // Register a new passkey
  const registerPasskey = useCallback(async (deviceName?: string) => {
    if (!user || !session) {
      throw new Error('User must be logged in to register a passkey');
    }

    setIsLoading(true);
    try {
      // Get challenge from server
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke(
        'webauthn-register',
        {
          body: { action: 'get-challenge' },
        }
      );

      if (challengeError) throw challengeError;

      const { challenge, userId, userName, rpId, rpName } = challengeData;

      // Create credential options
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64URLDecode(challenge),
        rp: {
          name: rpName,
          id: rpId,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
      };

      // Create credential using WebAuthn
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const attestationResponse = credential.response as AuthenticatorAttestationResponse;

      // Prepare credential for storage
      const credentialData = {
        id: credential.id,
        rawId: base64URLEncode(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: base64URLEncode(attestationResponse.clientDataJSON),
          attestationObject: base64URLEncode(attestationResponse.attestationObject),
        },
      };

      // Register with server
      const { data: registerData, error: registerError } = await supabase.functions.invoke(
        'webauthn-register',
        {
          body: {
            action: 'register',
            credential: credentialData,
            deviceName: deviceName || getDeviceName(),
          },
        }
      );

      if (registerError) throw registerError;

      // Refresh passkeys list
      await fetchPasskeys();

      return { success: true };
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, session, fetchPasskeys]);

  // Authenticate with passkey
  const authenticateWithPasskey = useCallback(async (email?: string) => {
    setIsLoading(true);
    try {
      // Get challenge from server
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke(
        'webauthn-authenticate',
        {
          body: { action: 'get-challenge', email },
        }
      );

      if (challengeError) throw challengeError;

      const { challenge, rpId, allowCredentials } = challengeData;

      // Create authentication options
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64URLDecode(challenge),
        timeout: 60000,
        rpId,
        userVerification: 'required',
        allowCredentials: allowCredentials?.map((cred: { id: string; type: string }) => ({
          id: base64URLDecode(cred.id),
          type: cred.type as PublicKeyCredentialType,
          transports: ['internal'] as AuthenticatorTransport[],
        })),
      };

      // Get credential using WebAuthn
      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Authentication cancelled');
      }

      const assertionResponse = credential.response as AuthenticatorAssertionResponse;

      // Prepare credential for verification
      const credentialData = {
        id: credential.id,
        rawId: base64URLEncode(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: base64URLEncode(assertionResponse.clientDataJSON),
          authenticatorData: base64URLEncode(assertionResponse.authenticatorData),
          signature: base64URLEncode(assertionResponse.signature),
          userHandle: assertionResponse.userHandle
            ? base64URLEncode(assertionResponse.userHandle)
            : null,
        },
      };

      // Verify with server
      const { data: authData, error: authError } = await supabase.functions.invoke(
        'webauthn-authenticate',
        {
          body: {
            action: 'authenticate',
            credential: credentialData,
          },
        }
      );

      if (authError) throw authError;

      // Use the token to sign in
      if (authData.token && authData.type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: authData.token,
          type: authData.type,
        });

        if (verifyError) throw verifyError;

        return { success: true };
      }

      throw new Error('Failed to authenticate');
    } catch (error: any) {
      console.error('Passkey authentication error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a passkey
  const deletePasskey = useCallback(async (passkeyId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('passkey_credentials')
      .delete()
      .eq('id', passkeyId)
      .eq('user_id', user.id);

    if (error) throw error;

    await fetchPasskeys();
  }, [user, fetchPasskeys]);

  return {
    isSupported,
    isPlatformAuthenticatorAvailable,
    registerPasskey,
    authenticateWithPasskey,
    deletePasskey,
    fetchPasskeys,
    passkeys,
    isLoading,
  };
};

// Helper function to get device name
function getDeviceName(): string {
  const userAgent = navigator.userAgent;
  
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Mac/.test(userAgent)) return 'Mac';
  if (/Android/.test(userAgent)) return 'Android Device';
  if (/Windows/.test(userAgent)) return 'Windows PC';
  if (/Linux/.test(userAgent)) return 'Linux PC';
  
  return 'Unknown Device';
}
