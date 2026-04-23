import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Cookie, Mail } from 'lucide-react';
import { PageChangelog } from '@/components/seo/PageChangelog';

const CookiePolicy = () => {
  const lastUpdated = 'January 16, 2026';

  const cookieTypes = [
    {
      name: 'Essential Cookies',
      description: 'These cookies are necessary for the website to function properly. They enable basic features like page navigation, secure areas access, and shopping cart functionality.',
      examples: ['Session cookies', 'Authentication cookies', 'Security cookies'],
      canDisable: false,
    },
    {
      name: 'Functional Cookies',
      description: 'These cookies enable enhanced functionality and personalization. They remember your preferences and settings to provide a better experience.',
      examples: ['Language preferences', 'Region settings', 'User preferences'],
      canDisable: true,
    },
    {
      name: 'Analytics Cookies',
      description: 'These cookies help us understand how visitors interact with our website. They collect information about page visits, traffic sources, and user behavior.',
      examples: ['Google Analytics', 'Page view tracking', 'Performance monitoring'],
      canDisable: true,
    },
    {
      name: 'Marketing Cookies',
      description: 'These cookies are used to track visitors across websites. They help display relevant advertisements and measure the effectiveness of marketing campaigns.',
      examples: ['Advertising cookies', 'Social media cookies', 'Retargeting cookies'],
      canDisable: true,
    },
  ];

  return (
    <Layout>
      <Helmet>
        <title>Cookie Policy | GetPawsy - How We Use Cookies</title>
        <meta name="description" content="Learn how GetPawsy uses cookies to improve your shopping experience. Our cookie policy explains essential, functional, analytics, and marketing cookies." /></Helmet>
      <div className="min-h-screen py-16 lg:py-24">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Cookie className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Cookie Policy
              </h1>
              <p className="text-muted-foreground">
                Last Updated: {lastUpdated}
              </p>
            </div>

            <PageChangelog pageKey="cookies" />

            {/* Content */}
            <div className="prose prose-lg max-w-none">
              <div className="bg-muted/30 rounded-2xl p-6 mb-8">
                <p className="text-foreground m-0">
                  This Cookie Policy explains how GetPawsy uses cookies and similar tracking technologies 
                  when you visit our website. By using our website, you consent to our use of cookies as 
                  described in this policy.
                </p>
              </div>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  What Are Cookies?
                </h2>
                <p className="text-muted-foreground">
                  Cookies are small text files that are stored on your device (computer, smartphone, or tablet) 
                  when you visit a website. They are widely used to make websites work more efficiently and 
                  provide information to website owners. Cookies help us remember your preferences, understand 
                  how you use our website, and improve your overall experience.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Types of Cookies We Use
                </h2>
                <div className="space-y-6">
                  {cookieTypes.map((cookie, index) => (
                    <div key={index} className="bg-muted/30 rounded-2xl p-6">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-xl font-semibold text-foreground">{cookie.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          cookie.canDisable 
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' 
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {cookie.canDisable ? 'Optional' : 'Required'}
                        </span>
                      </div>
                      <p className="text-muted-foreground mb-3">{cookie.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {cookie.examples.map((example, idx) => (
                          <span 
                            key={idx} 
                            className="text-sm bg-background px-3 py-1 rounded-full text-muted-foreground"
                          >
                            {example}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  How We Use Cookies
                </h2>
                <p className="text-muted-foreground mb-4">
                  We use cookies for various purposes, including:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Authentication:</strong> To recognize you when you sign in to your account</li>
                  <li><strong>Shopping Cart:</strong> To remember items in your shopping cart</li>
                  <li><strong>Preferences:</strong> To remember your language, currency, and other settings</li>
                  <li><strong>Security:</strong> To detect fraud and protect your account</li>
                  <li><strong>Analytics:</strong> To understand how visitors use our website</li>
                  <li><strong>Advertising:</strong> To show relevant ads and measure their effectiveness</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Third-Party Cookies
                </h2>
                <p className="text-muted-foreground mb-4">
                  Some cookies on our website are set by third-party services that we use. These include:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Google Analytics:</strong> For website analytics and performance monitoring</li>
                  <li><strong>Payment Processors:</strong> For secure payment processing</li>
                  <li><strong>Social Media:</strong> For social sharing functionality</li>
                  <li><strong>Advertising Networks:</strong> For targeted advertising</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  These third parties have their own privacy policies that govern how they use and share 
                  information they collect.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Managing Cookies
                </h2>
                <p className="text-muted-foreground mb-4">
                  You have control over how cookies are used on your device. You can:
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Browser Settings:</strong> Most browsers allow you to block or delete cookies 
                  through their settings. Check your browser's help section for instructions.</li>
                  <li><strong>Opt-Out Tools:</strong> Use opt-out tools provided by advertising networks 
                  to limit targeted advertising.</li>
                  <li><strong>Private Browsing:</strong> Use private or incognito mode to limit cookie storage.</li>
                </ul>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 mt-4">
                  <p className="text-yellow-800 dark:text-yellow-200 m-0 text-sm">
                    <strong>Note:</strong> Disabling cookies may affect your experience on our website. 
                    Some features, such as the shopping cart and account login, require cookies to function properly.
                  </p>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Cookie Duration
                </h2>
                <p className="text-muted-foreground mb-4">
                  Cookies can be either "session" or "persistent":
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                  <li><strong>Session Cookies:</strong> These are temporary cookies that expire when you 
                  close your browser. They are used to remember your actions during a single browsing session.</li>
                  <li><strong>Persistent Cookies:</strong> These cookies remain on your device for a set 
                  period or until you delete them. They are used to remember your preferences across 
                  multiple visits.</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Updates to This Policy
                </h2>
                <p className="text-muted-foreground">
                  We may update this Cookie Policy from time to time to reflect changes in our practices 
                  or for other operational, legal, or regulatory reasons. We encourage you to review this 
                  policy periodically. The "Last Updated" date at the top indicates when this policy was 
                  last revised.
                </p>
              </section>

              <section className="mb-10">
                <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                  Contact Us
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you have questions about our use of cookies, please contact us:
                </p>
                <div className="bg-muted/30 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail className="w-5 h-5 text-primary" />
                    <a href="mailto:support@getpawsy.pet" className="text-primary hover:underline">
                      support@getpawsy.pet
                    </a>
                  </div>
                  <div className="text-muted-foreground space-y-1">
                    <p className="m-0 font-semibold text-foreground">GetPawsy</p>
                    <p className="m-0">De Haasstraat 11</p>
                    <p className="m-0">7312 VG Apeldoorn</p>
                    <p className="m-0">Nederland</p>
                    <p className="m-0 mt-3 text-sm">KvK: 78156955</p>
                    <p className="m-0 text-sm">VAT ID: NL003295015B69</p>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default CookiePolicy;
