import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import logo from '@/assets/logo-getpawsy-full.png';
import { useCrawlerTracking } from '@/hooks/useCrawlerTracking';

const TechnicalDeclaration = () => {
  // Track crawler visits to this page
  useCrawlerTracking('/technical-declaration');

  useEffect(() => {
    // Set document title for PDF
    document.title = 'Technical Declaration - GetPawsy.pet - Google Ads Review';
  }, []);

  return (
    <>
    <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
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
      <header className="border-b-2 border-gray-800 pb-4 mb-5">
        <div className="flex items-start gap-4 mb-3">
          <img 
            src={logo} 
            alt="GetPawsy Logo" 
            className="h-12 w-auto print:h-10"
          />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 mb-0.5 print:text-lg">
              Technical Declaration: Website Architecture
            </h1>
            <p className="text-sm text-gray-600">
              Cloaking Prevention Documentation for Google Ads Account Review
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
          <div><strong>Domain:</strong> getpawsy.pet</div>
          <div><strong>Account:</strong> support@getpawsy.pet</div>
          <div><strong>Document Date:</strong> {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div className="text-amber-700 font-medium"><strong>⏱️ Last Updated:</strong> 30 Jan 2026</div>
        </div>
      </header>

      {/* Section 1 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          1. Website Architecture Overview
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1 font-medium w-1/3">Domain</td>
              <td className="py-1">https://getpawsy.pet (HTTPS secured)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1 font-medium">Framework</td>
              <td className="py-1">React 18.3.1 with Vite 5.x (SPA)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1 font-medium">Styling</td>
              <td className="py-1">Tailwind CSS</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1 font-medium">Hosting</td>
              <td className="py-1">Lovable Cloud (serverless)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-1 font-medium">Type</td>
              <td className="py-1">E-commerce pet products store</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 2 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          2. Why This Is NOT Cloaking
        </h2>
        <p className="mb-2 text-sm text-gray-700">
          <strong>Definition:</strong> Showing different content to crawlers than to users.
        </p>
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-1 text-left">Aspect</th>
              <th className="border border-gray-300 p-1 text-left">Implementation</th>
              <th className="border border-gray-300 p-1 text-left w-16">Risk</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-1">Content Delivery</td>
              <td className="border border-gray-300 p-1">Same JS bundle for all visitors</td>
              <td className="border border-gray-300 p-1 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1">User-Agent</td>
              <td className="border border-gray-300 p-1">No UA-based content switching</td>
              <td className="border border-gray-300 p-1 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1">IP Redirects</td>
              <td className="border border-gray-300 p-1">No IP-based differentiation</td>
              <td className="border border-gray-300 p-1 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1">Crawler Pages</td>
              <td className="border border-gray-300 p-1">Identical rendering for all</td>
              <td className="border border-gray-300 p-1 text-green-700 font-medium">✅ None</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 3 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          3. Content Sanitization (Security, Not Cloaking)
        </h2>
        <p className="mb-2 text-sm text-gray-700">
          We use <strong>DOMPurify</strong> to sanitize dynamic HTML for XSS prevention:
        </p>
        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto mb-2 border border-gray-300">
{`// src/lib/sanitize.ts - DOMPurify.sanitize(html, {
//   ALLOWED_TAGS: ['p','br','strong','em',...],
//   FORBID_TAGS: ['script','iframe','object','embed']
// });`}
        </pre>
        <p className="text-sm text-gray-700">
          <strong>Purpose:</strong> Prevents XSS attacks—does NOT differentiate crawlers from users.
        </p>
      </section>

      {/* Section 4 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          4. Sitemap Implementation
        </h2>
        <p className="text-sm text-gray-700 mb-2">
          <strong>URL:</strong> https://getpawsy.pet/sitemap.xml — Delivered as <strong>pure XML</strong> via server-side edge function.
        </p>
        <ul className="list-disc list-inside text-sm text-gray-700 ml-2">
          <li>Googlebot receives valid XML immediately (no JS required)</li>
          <li>Submitted and verified in Google Search Console</li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          5. SPA Rendering Behavior
        </h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 ml-2 space-y-1">
          <li><strong>Initial Load:</strong> Server sends HTML shell + JS bundle</li>
          <li><strong>Client Rendering:</strong> JS fetches data and renders</li>
          <li><strong>Crawlers:</strong> Googlebot executes JS and sees same content as users</li>
        </ol>
        <p className="text-sm text-gray-700 mt-2">
          <strong>Verified:</strong> Google Search Console URL Inspection confirms correct rendering.
        </p>
      </section>

      {/* Page Break */}
      <div className="page-break"></div>

      {/* Section 6 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          6. Business Legitimacy
        </h2>
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <tbody>
            <tr>
              <td className="border border-gray-300 p-1 font-medium bg-gray-50 w-1/3">Business</td>
              <td className="border border-gray-300 p-1">GetPawsy (Sole Proprietorship, NL)</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1 font-medium bg-gray-50">KvK</td>
              <td className="border border-gray-300 p-1">78156955</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1 font-medium bg-gray-50">VAT ID</td>
              <td className="border border-gray-300 p-1">NL003295015B69</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-1 font-medium bg-gray-50">Address</td>
              <td className="border border-gray-300 p-1">De Haasstraat 11, 7312 VG Apeldoorn, Netherlands</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 7 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          7. Technical Evidence Against Cloaking
        </h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 ml-2 space-y-1">
          <li><strong>No UA Checks:</strong> Edge functions don't inspect User-Agent headers</li>
          <li><strong>No Conditional Redirects:</strong> No crawler-detection redirects</li>
          <li><strong>Transparent URLs:</strong> SEO-friendly slugs accessible to all</li>
          <li><strong>Open Framework:</strong> React is Google-approved</li>
          <li><strong>Consistent Content:</strong> Same database content for all users</li>
        </ol>
      </section>

      {/* Section 8 */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 border-b border-gray-300 pb-1 print:text-sm">
          8. Possible Cause of False Positive
        </h2>
        <p className="text-sm text-gray-700 mb-2">
          <strong>Google Workspace domain mismatch</strong> may have triggered false positive:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-700 ml-2 space-y-1">
          <li>Temporary domain (<code className="bg-gray-100 px-1 text-xs">*.appstempdomain.goog</code>) was visible during setup</li>
          <li>Resolved: <code className="bg-gray-100 px-1 text-xs">support@getpawsy.pet</code> is now primary</li>
          <li>Temporary account removed, 2FA enabled</li>
        </ul>
      </section>

      {/* Section 9 - Request */}
      <section className="mb-5 bg-gray-50 p-4 rounded-lg border border-gray-300">
        <h2 className="text-base font-bold text-gray-900 mb-2 print:text-sm">
          9. Request for Account Reactivation
        </h2>
        <p className="text-sm text-gray-700 mb-2">We respectfully request reactivation. Our website:</p>
        <ul className="list-none text-sm text-gray-700 space-y-1">
          <li>✅ Delivers consistent content to all visitors</li>
          <li>✅ Uses industry-standard security practices</li>
          <li>✅ Operated by legitimate NL-registered business</li>
          <li>✅ No prior policy violations</li>
          <li>✅ Verified in Google Search Console</li>
        </ul>
        <p className="text-sm text-gray-700 mt-2">
          Happy to provide additional documentation or schedule a review.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-gray-800 pt-4 mt-5">
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
          Generated {new Date().toISOString().split('T')[0]} • GetPawsy Technical Declaration
        </p>
      </footer>
    </div>
    </>
  );
};

export default TechnicalDeclaration;
