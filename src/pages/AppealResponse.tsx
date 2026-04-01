import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import logo from '@/assets/logo-getpawsy-full.png';
import safeBrowsingScreenshot from '@/assets/safe-browsing-report.png';
import { CheckCircle2, ExternalLink, FileText, Shield, Globe, Code, Mail, Camera, AlertTriangle } from 'lucide-react';
import { useCrawlerTracking } from '@/hooks/useCrawlerTracking';

const AppealResponse = () => {
  // Track crawler visits to this page
  useCrawlerTracking('/appeal-response');

  useEffect(() => {
    document.title = 'Google Ads Appeal Response - GetPawsy.pet';
  }, []);

  // Direct answer to Google's cloaking appeal guideline (Refined by Gemini)
  const cloakingExplanation = {
    question: 'Technical Clarifications: Why might different content have been detected?',
    googleGuideline: 'Google Ads Appeal Tip: "For cloaking violations, let us know why you were showing different content to Google than to other users."',
    answer: `We believe the "Cloaking" flag is a **false positive** triggered by our technical stack and a recent domain migration.

**1. SPA Architecture & Rendering**
Our site (getpawsy.pet) is a React Single Page Application (SPA). The initial server response serves a shell while JavaScript renders the final content client-side. This delay in "Final State" rendering can sometimes be misinterpreted by automated crawlers as serving different content.

**2. Resolved Redirect Issue**
During our initial deployment, we briefly utilized Google Workspace's temporary domain (*.appstempdomain.goog). This redirect has since been removed. We suspect the automated system may have flagged this transition as a cloaking attempt.

**3. Content Parity Confirmation**
We confirm that we serve **identical content to all users and bots**. There is no IP-based delivery or User-Agent gating.

**Supporting Evidence:**
• SHA-256 Validation: Content hash consistency proves bots and users receive the same data
• Search Console Health: 918 pages indexed successfully with no security issues flagged
• Safe Browsing Report: No unsafe content found
• robots.txt: All Google crawlers explicitly allowed (no JS/CSS blocking)`,
  };

  // Screenshot tips for reviewers
  const screenshotTips = [
    {
      title: 'Google Search Console',
      description: 'Screenshot van "Geen beveiligingsproblemen gevonden" pagina',
      path: 'Security & Manual Actions → Security Issues',
    },
    {
      title: 'KvK Registratie',
      description: 'Screenshot van officiële KvK uittreksel of online verificatie',
      path: 'kvk.nl → Zoek: 78156955',
    },
    {
      title: 'Safe Browsing Report',
      description: 'Screenshot van Google Transparency Report',
      path: 'transparencyreport.google.com/safe-browsing/search?url=getpawsy.pet',
    },
  ];

  const questions = [
    {
      id: 1,
      question: 'Heeft u een officiële e-mail of melding van Google Ads ontvangen waarin cloaking als reden voor opschorting wordt opgegeven?',
      answer: 'Ja, wij hebben een melding ontvangen dat ons account is opgeschort wegens vermoedelijke "cloaking". Dit is een false positive. Onze website is een standaard React Single Page Application (SPA) die exact dezelfde content toont aan alle bezoekers, inclusief Google crawlers.',
    },
    {
      id: 2,
      question: 'Heeft u een formeel bezwaar ingediend via het Google Ads-account of het supportformulier?',
      answer: 'Ja, wij hebben een formeel bezwaar ingediend en hebben uitgebreide technische documentatie verstrekt die aantoont dat onze website geen cloaking toepast. Zie onze Technical Declaration voor alle details.',
      link: '/technical-declaration',
      linkText: 'Bekijk Technical Declaration',
    },
    {
      id: 3,
      question: 'Maakt uw site gebruik van scripts van derden, omleidingen of personalisatie die door crawlers verkeerd kunnen worden geïnterpreteerd?',
      answer: 'Nee. Onze website gebruikt alleen standaard tracking scripts:\n\n• Google Analytics 4 (G-5WYL8RJDZF)\n• Google Ads Conversion Tracking (AW-381705659)\n\nEr zijn geen omleidingen of personalisatie die content wijzigen op basis van User-Agent. De enige redirect is onze sitemap.xml die crawlers doorstuurt naar de server-side XML versie, wat standaard praktijk is voor SPAs.',
    },
    {
      id: 4,
      question: 'Heeft u de site getest met de crawlen van Google (URL-inspectie in Search Console of mobielvriendelijke test) om te bevestigen dat de content consistent is?',
      answer: 'Ja. Google Search Console URL Inspection toont dat Googlebot onze pagina\'s correct rendert en exact dezelfde content ziet als gewone gebruikers. De rendered HTML komt overeen met wat gebruikers zien in hun browser.',
    },
    {
      id: 5,
      question: 'Zijn alle dynamische pagina\'s toegankelijk via directe URL\'s en geeft de sitemap alle pagina\'s weer?',
      answer: 'Ja. Alle pagina\'s zijn direct toegankelijk via hun URL:\n\n• Producten: /product/[slug]\n• Categorieën: /products?category=[name]\n• Blog: /blog/[slug]\n• Bestsellers: /bestseller/[slug]\n\nOnze dynamische XML sitemap (https://getpawsy.pet/sitemap.xml) bevat alle pagina\'s en is geverifieerd in Google Search Console.',
    },
    {
      id: 6,
      question: 'Heeft u uw SPA-installatie, DOMPurify-gebruik en sitemapconfiguratie gedocumenteerd voor indiening van het bezwaar?',
      answer: 'Ja. Volledige documentatie is beschikbaar in onze Technical Declaration, inclusief:\n\n• React 18.3.1 + Vite 5.x framework details\n• DOMPurify sanitization configuratie voor XSS preventie\n• Server-side XML sitemap implementatie\n• Afwezigheid van User-Agent of IP-gebaseerde content switching',
      link: '/technical-declaration',
      linkText: 'Bekijk Technical Declaration',
    },
    {
      id: 7,
      question: 'Heeft u eerdere advertenties of beleidsschendingen die van invloed kunnen zijn op een heractivering?',
      answer: 'Nee. Dit is ons eerste Google Ads account en we hebben geen eerdere beleidsschendingen. Wij zijn een legitiem geregistreerd Nederlands bedrijf (GetPawsy, KvK 78156955) dat huisdierproducten verkoopt.',
    },
    {
      id: 8,
      question: 'Kunt u bevestigen welk specifiek probleem u ondervindt?',
      answer: 'Ons Google Ads account (Customer ID: 470-628-8595) is opgeschort wegens vermeende "cloaking". Dit is een false positive veroorzaakt door onze Single Page Application (SPA) architectuur. Wij verzoeken om handmatige review en heractivering van ons account.',
    },
  ];

  const evidenceLinks = [
    {
      title: 'Google Safe Browsing Report',
      description: 'Bevestigt dat getpawsy.pet geen onveilige content bevat',
      url: 'https://transparencyreport.google.com/safe-browsing/search?url=getpawsy.pet',
      icon: Shield,
      status: 'Geen onveilige content gevonden',
    },
    {
      title: 'Technical Declaration',
      description: 'Volledige technische documentatie van onze website architectuur',
      url: '/technical-declaration',
      icon: FileText,
      internal: true,
    },
    {
      title: 'Sitemap',
      description: 'Dynamische XML sitemap met alle pagina\'s',
      url: 'https://getpawsy.pet/sitemap.xml',
      icon: Globe,
    },
    {
      title: 'Website',
      description: 'Live website voor verificatie',
      url: 'https://getpawsy.pet',
      icon: Code,
    },
  ];

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <div className="min-h-screen bg-white text-black p-6 max-w-4xl mx-auto print:p-2 print:max-w-none">
        <style>{`
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
            @page { margin: 10mm 12mm; }
            html, body { font-size: 11px; }
          }
        `}</style>

        {/* Print Button */}
        <div className="no-print mb-6 flex gap-4">
          <button 
            onClick={() => window.print()} 
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            📄 Save as PDF / Print
          </button>
          <button 
            onClick={() => window.history.back()} 
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            ← Back
          </button>
        </div>

        {/* Header */}
        <header className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-start gap-4 mb-3">
            <img 
              src={logo} 
              alt="GetPawsy Logo" 
              className="h-12 w-auto print:h-10"
            />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 mb-0.5 print:text-lg">
                Google Ads Appeal Response
              </h1>
              <p className="text-sm text-gray-600">
                Antwoorden op Google Support Vragen - Cloaking False Positive
              </p>
            </div>
          </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
            <div><strong>Domain:</strong> getpawsy.pet</div>
            <div><strong>Customer ID:</strong> 470-628-8595</div>
            <div><strong>Document Date:</strong> {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div className="text-amber-700 font-medium"><strong>⏱️ Last Updated:</strong> 30 Jan 2026</div>
          </div>
        </header>

        {/* Summary */}
        <section className="mb-6 bg-green-50 border border-green-200 p-4 rounded-lg">
          <h2 className="text-base font-bold text-green-800 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Samenvatting
          </h2>
          <p className="text-sm text-green-700">
            GetPawsy.pet is een legitieme e-commerce website voor huisdierproducten, gebouwd met React (SPA). 
            De opschorting wegens "cloaking" is een <strong>false positive</strong>. Alle bewijs toont aan dat 
            onze website identieke content toont aan alle bezoekers, inclusief Google crawlers.
          </p>
        </section>

        {/* Direct Cloaking Explanation - Google's Recommended Format */}
        <section className="mb-6 bg-amber-50 border border-amber-300 p-4 rounded-lg">
          <div className="mb-3">
            <p className="text-xs text-amber-700 italic mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {cloakingExplanation.googleGuideline}
            </p>
            <h2 className="text-base font-bold text-amber-900">
              {cloakingExplanation.question}
            </h2>
          </div>
          <div className="text-sm text-amber-900 whitespace-pre-line">
            {cloakingExplanation.answer}
          </div>
        </section>

        {/* Evidence Section with Screenshot */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-300 pb-1">
            Bewijs
          </h2>
          
          {/* Safe Browsing Screenshot */}
          <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-3 py-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                Google Safe Browsing Report - getpawsy.pet
              </h3>
            </div>
            <img 
              src={safeBrowsingScreenshot} 
              alt="Google Safe Browsing Report showing no unsafe content found for getpawsy.pet" 
              className="w-full"
            />
            <div className="bg-green-50 px-3 py-2 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              <span><strong>Status:</strong> Geen onveilige content gevonden (25 jan 2026)</span>
            </div>
          </div>

          {/* Evidence Links */}
          <div className="grid grid-cols-2 gap-3">
            {evidenceLinks.map((link, index) => (
              <a
                key={index}
                href={link.url}
                target={link.internal ? undefined : '_blank'}
                rel={link.internal ? undefined : 'noopener noreferrer'}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <link.icon className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                    {link.title}
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 truncate">{link.description}</p>
                  {link.status && (
                    <span className="text-xs text-green-600 font-medium">{link.status}</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Screenshot Tips for Submission */}
        <section className="mb-6 bg-purple-50 border border-purple-200 p-4 rounded-lg">
          <h2 className="text-base font-bold text-purple-800 mb-3 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            📎 Aanbevolen Bijlagen voor Bezwaar
          </h2>
          <p className="text-xs text-purple-700 mb-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Tip: Google reviewers klikken soms niet op externe links. Voeg screenshots direct toe aan het bezwaarformulier.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {screenshotTips.map((tip, index) => (
              <div key={index} className="bg-white p-3 rounded border border-purple-100">
                <h3 className="text-sm font-medium text-purple-900 mb-1">{tip.title}</h3>
                <p className="text-xs text-purple-700 mb-2">{tip.description}</p>
                <code className="text-xs bg-purple-100 px-2 py-1 rounded block text-purple-800 break-all">
                  {tip.path}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* Page Break */}
        <div className="page-break"></div>

        {/* Questions and Answers */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4 border-b border-gray-300 pb-1">
            Antwoorden op Google Support Vragen
          </h2>
          
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2">
                  <h3 className="text-sm font-medium text-gray-800">
                    {q.id}. {q.question}
                  </h3>
                </div>
                <div className="px-3 py-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {q.answer}
                  </p>
                  {q.link && (
                    <a 
                      href={q.link}
                      className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline"
                    >
                      <FileText className="w-4 h-4" />
                      {q.linkText}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Business Information */}
        <section className="mb-6 bg-gray-50 p-4 rounded-lg">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            Bedrijfsinformatie
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Bedrijfsnaam:</strong> GetPawsy (Eenmanszaak)</p>
              <p><strong>KvK:</strong> 78156955</p>
              <p><strong>VAT ID:</strong> NL003295015B69</p>
            </div>
            <div>
              <p><strong>Adres:</strong> De Haasstraat 11, 7312 VG Apeldoorn, NL</p>
              <p><strong>Website:</strong> https://getpawsy.pet</p>
              <p><strong>Email:</strong> support@getpawsy.pet</p>
            </div>
          </div>
        </section>

        {/* Request */}
        <section className="mb-6 bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <h2 className="text-base font-bold text-blue-800 mb-2 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Verzoek
          </h2>
          <p className="text-sm text-blue-700">
            Wij verzoeken vriendelijk om een handmatige review van ons Google Ads account (Customer ID: 470-628-8595) 
            en heractivering op basis van het bovenstaande bewijs. Onze website voldoet volledig aan het Google Ads beleid 
            en past geen cloaking of andere misleidende praktijken toe.
          </p>
        </section>

        {/* Footer */}
        <footer className="border-t-2 border-gray-800 pt-4 mt-6">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>
              <p><strong>Email:</strong> support@getpawsy.pet</p>
              <p><strong>Web:</strong> https://getpawsy.pet</p>
            </div>
            <div className="text-right">
              <p><strong>Business:</strong> Skidzo</p>
              <p><strong>KvK:</strong> 78156955</p>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">
            Generated {new Date().toISOString().split('T')[0]} • GetPawsy Google Ads Appeal Response
          </p>
        </footer>
      </div>
    </>
  );
};

export default AppealResponse;
