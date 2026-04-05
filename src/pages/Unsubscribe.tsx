import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { MailX, CheckCircle, AlertCircle, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type UnsubscribeStatus = 'loading' | 'confirming' | 'success' | 'error' | 'invalid' | 'resubscribed';

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<UnsubscribeStatus>('loading');
  const [email, setEmail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    // Check if token is a UUID (secure preference_token) or legacy base64
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(token)) {
      // Secure UUID token - we'll get the email from the server
      setStatus('confirming');
      // Email will be revealed after unsubscribe action for privacy
      setEmail('your email');
    } else {
      // Try legacy base64 decode for backward compatibility
      try {
        const decodedEmail = atob(token);
        if (decodedEmail.includes('@')) {
          setEmail(decodedEmail);
          setStatus('confirming');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('invalid');
      }
    }
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;

    setStatus('loading');

    try {
      const { data, error } = await supabase.functions.invoke('unsubscribe-newsletter', {
        body: { token, action: 'unsubscribe' },
      });

      if (error) throw error;

      setStatus('success');
    } catch (error: any) {
      console.error('Unsubscribe error:', error);
      setErrorMessage(error.message || 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const handleResubscribe = async () => {
    if (!token) return;

    setStatus('loading');

    try {
      const { data, error } = await supabase.functions.invoke('unsubscribe-newsletter', {
        body: { token, action: 'resubscribe' },
      });

      if (error) throw error;

      setStatus('resubscribed');
    } catch (error: any) {
      console.error('Resubscribe error:', error);
      setErrorMessage(error.message || 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-6 animate-spin" />
            <div className="text-2xl font-display font-bold text-foreground mb-2">
              Processing...
            </h1>
            <p className="text-muted-foreground">
              Please wait while we process your request.
            </p>
          </motion.div>
        );

      case 'confirming':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-6">
              <MailX className="w-10 h-10 text-orange-600" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-4">
              Unsubscribe from Newsletter
            </h1>
            <p className="text-muted-foreground text-lg mb-2">
              Are you sure you want to unsubscribe?
            </p>
            <p className="text-muted-foreground mb-8">
              <strong>{email}</strong> will no longer receive our newsletter emails.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleUnsubscribe}
                variant="destructive"
                size="lg"
                className="gap-2"
              >
                <MailX className="w-4 h-4" />
                Yes, Unsubscribe Me
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
              >
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Keep Me Subscribed
                </Link>
              </Button>
            </div>
          </motion.div>
        );

      case 'success':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-4">
              Successfully Unsubscribed
            </h1>
            <p className="text-muted-foreground text-lg mb-2">
              You've been removed from our newsletter.
            </p>
            <p className="text-muted-foreground mb-8">
              We're sad to see you go! Changed your mind?
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={handleResubscribe} size="lg" className="gap-2">
                <Mail className="w-4 h-4" />
                Re-subscribe
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Homepage
                </Link>
              </Button>
            </div>
          </motion.div>
        );

      case 'resubscribed':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-4">
              Welcome Back! 🎉
            </h1>
            <p className="text-muted-foreground text-lg mb-2">
              You've been re-subscribed to our newsletter.
            </p>
            <p className="text-muted-foreground mb-8">
              Great to have you back! You'll receive our latest pet tips and exclusive offers again.
            </p>
            <Button asChild size="lg">
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Homepage
              </Link>
            </Button>
          </motion.div>
        );

      case 'error':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-4">
              Something Went Wrong
            </h1>
            <p className="text-muted-foreground text-lg mb-8">
              {errorMessage}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={handleUnsubscribe} size="lg">
                Try Again
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">Contact Support</Link>
              </Button>
            </div>
          </motion.div>
        );

      case 'invalid':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-yellow-600" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-4">
              Invalid Unsubscribe Link
            </h1>
            <p className="text-muted-foreground text-lg mb-8">
              This unsubscribe link appears to be invalid or expired. 
              Please use the link from your most recent newsletter email.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Homepage
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">Contact Support</Link>
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="min-h-screen py-20 lg:py-32">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </Layout>
  );
};

export default Unsubscribe;
