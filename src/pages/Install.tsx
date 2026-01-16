import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, Check, Share, Plus, MoreVertical, ArrowRight, Wifi, Bell, Zap } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const features = [
    {
      icon: Zap,
      title: 'Quick Access',
      description: 'Launch the app directly from your home screen',
    },
    {
      icon: Wifi,
      title: 'Works Offline',
      description: 'Browse products even without internet',
    },
    {
      icon: Bell,
      title: 'Notifications',
      description: 'Get updates about deals and offers',
    },
  ];

  return (
    <Layout>
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          {/* App Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="w-24 h-24 mx-auto mb-6 rounded-3xl overflow-hidden shadow-xl"
          >
            <img 
              src="/pwa-192x192.png" 
              alt="GetPawsy App" 
              className="w-full h-full object-cover"
            />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-display font-bold text-foreground mb-2"
          >
            Install GetPawsy
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground mb-8"
          >
            Add GetPawsy to your home screen for the best experience
          </motion.p>

          {/* Already Installed */}
          {isInstalled ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-success/10 border border-success/20 rounded-2xl p-6 mb-8"
            >
              <div className="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-success-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                App is installed!
              </h2>
              <p className="text-muted-foreground">
                You can now open GetPawsy from your home screen.
              </p>
            </motion.div>
          ) : (
            <>
              {/* Install Button - Chrome/Android */}
              {deferredPrompt && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mb-8"
                >
                  <Button
                    size="lg"
                    className="w-full gap-3 h-14 text-lg font-semibold rounded-2xl"
                    onClick={handleInstallClick}
                  >
                    <Download className="w-5 h-5" />
                    Install App
                  </Button>
                </motion.div>
              )}

              {/* iOS Instructions */}
              {isIOS && !deferredPrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-muted rounded-2xl p-6 mb-8 text-left"
                >
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Smartphone className="w-5 h-5" />
                    Install on iPhone/iPad
                  </h3>
                  <ol className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        1
                      </span>
                      <span className="text-muted-foreground">
                        Tap the <Share className="w-4 h-4 inline mx-1" /> <strong>Share</strong> button at the bottom
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        2
                      </span>
                      <span className="text-muted-foreground">
                        Scroll down and tap <Plus className="w-4 h-4 inline mx-1" /> <strong>Add to Home Screen</strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        3
                      </span>
                      <span className="text-muted-foreground">
                        Tap <strong>Add</strong> in the top right
                      </span>
                    </li>
                  </ol>
                </motion.div>
              )}

              {/* Android Instructions (fallback) */}
              {isAndroid && !deferredPrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-muted rounded-2xl p-6 mb-8 text-left"
                >
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Smartphone className="w-5 h-5" />
                    Install on Android
                  </h3>
                  <ol className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        1
                      </span>
                      <span className="text-muted-foreground">
                        Tap <MoreVertical className="w-4 h-4 inline mx-1" /> <strong>Menu</strong> in the top right
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        2
                      </span>
                      <span className="text-muted-foreground">
                        Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        3
                      </span>
                      <span className="text-muted-foreground">
                        Confirm by tapping <strong>Install</strong>
                      </span>
                    </li>
                  </ol>
                </motion.div>
              )}

              {/* Desktop Instructions */}
              {!isIOS && !isAndroid && !deferredPrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-muted rounded-2xl p-6 mb-8 text-left"
                >
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    Install on Desktop
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Click the install icon in your browser's address bar, or:
                  </p>
                  <ol className="space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        1
                      </span>
                      <span className="text-muted-foreground">
                        Open the browser menu (⋮ or ⋯)
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        2
                      </span>
                      <span className="text-muted-foreground">
                        Click "Install GetPawsy" or "Install app"
                      </span>
                    </li>
                  </ol>
                </motion.div>
              )}
            </>
          )}

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid gap-4"
          >
            {features.map((feature, index) => (
              <Card key={index} className="bg-card/50 border-border/50">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold text-foreground">{feature.title}</h4>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* Continue Shopping Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8"
          >
            <Button variant="ghost" asChild className="gap-2">
              <a href="/products">
                Continue Shopping
                <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default Install;
