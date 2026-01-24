import { useEffect } from 'react';
import logo from '@/assets/logo-getpawsy-full.png';

const TechnicalDeclaration = () => {
  useEffect(() => {
    // Set document title for PDF
    document.title = 'Technical Declaration - GetPawsy.pet - Google Ads Review';
  }, []);

  return (
    <div className="min-h-screen bg-white text-black p-8 max-w-4xl mx-auto print:p-4">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
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
      <header className="border-b-2 border-gray-800 pb-6 mb-8">
        <div className="flex items-start gap-6 mb-4">
          <img 
            src={logo} 
            alt="GetPawsy Logo" 
            className="h-16 w-auto print:h-14"
          />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Technical Declaration: Website Architecture
            </h1>
            <p className="text-base text-gray-600">
              Cloaking Prevention Documentation for Google Ads Account Review
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm text-gray-500 bg-gray-50 p-3 rounded">
          <div><strong>Domain:</strong> https://getpawsy.pet</div>
          <div><strong>Account:</strong> support@getpawsy.pet</div>
          <div><strong>Date:</strong> {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </header>

      {/* Section 1 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          1. Website Architecture Overview
        </h2>
        <table className="w-full border-collapse mb-4">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium w-1/3">Domain</td>
              <td className="py-2">https://getpawsy.pet (HTTPS secured)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium">Framework</td>
              <td className="py-2">React 18.3.1 with Vite 5.x (Single Page Application)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium">Styling</td>
              <td className="py-2">Tailwind CSS with custom design system</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium">State Management</td>
              <td className="py-2">TanStack React Query for data fetching</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium">Hosting</td>
              <td className="py-2">Lovable Cloud (serverless infrastructure)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="py-2 font-medium">Website Type</td>
              <td className="py-2">E-commerce pet products store</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 2 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          2. Why This Is NOT Cloaking
        </h2>
        <p className="mb-4 text-gray-700">
          <strong>Definition of Cloaking:</strong> Showing different content to search engine crawlers than to human users.
        </p>
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">Aspect</th>
              <th className="border border-gray-300 p-2 text-left">Our Implementation</th>
              <th className="border border-gray-300 p-2 text-left">Risk</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2">Content Delivery</td>
              <td className="border border-gray-300 p-2">Same JavaScript bundle serves all visitors</td>
              <td className="border border-gray-300 p-2 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2">User-Agent Detection</td>
              <td className="border border-gray-300 p-2">No user-agent based content switching</td>
              <td className="border border-gray-300 p-2 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2">IP-Based Redirects</td>
              <td className="border border-gray-300 p-2">No IP-based content differentiation</td>
              <td className="border border-gray-300 p-2 text-green-700 font-medium">✅ None</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2">Crawler-Specific Pages</td>
              <td className="border border-gray-300 p-2">All pages render identically for all visitors</td>
              <td className="border border-gray-300 p-2 text-green-700 font-medium">✅ None</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 3 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          3. Content Sanitization (Security Practice, Not Cloaking)
        </h2>
        <p className="mb-4 text-gray-700">
          We use the <strong>DOMPurify</strong> library to sanitize all dynamic HTML content for security purposes:
        </p>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto mb-4 border border-gray-300">
{`// src/lib/sanitize.ts
import DOMPurify from 'dompurify';

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', ...],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  });
};`}
        </pre>
        <p className="text-gray-700">
          <strong>Purpose:</strong> This prevents XSS (Cross-Site Scripting) attacks—it does NOT differentiate 
          between crawlers and users. All visitors receive the same sanitized, safe content.
        </p>
      </section>

      {/* Page Break */}
      <div className="page-break"></div>

      {/* Section 4 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          4. Sitemap Implementation
        </h2>
        <p className="mb-4 text-gray-700">
          <strong>Sitemap URL:</strong> https://getpawsy.pet/sitemap.xml
        </p>
        <p className="mb-4 text-gray-700">
          Our sitemap is delivered as <strong>pure XML</strong> via a server-side edge function to ensure 
          search engines receive machine-readable content without requiring JavaScript execution:
        </p>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto mb-4 border border-gray-300">
{`# robots.txt
Sitemap: https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap?type=index`}
        </pre>
        <p className="text-gray-700 mb-2"><strong>Why this approach:</strong></p>
        <ul className="list-disc list-inside text-gray-700 ml-4">
          <li>Ensures Googlebot receives valid XML immediately</li>
          <li>No JavaScript rendering required for sitemap discovery</li>
          <li>Submitted and verified in Google Search Console</li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          5. SPA Rendering Behavior
        </h2>
        <p className="mb-4 text-gray-700">As a Single Page Application:</p>
        <ol className="list-decimal list-inside text-gray-700 ml-4 mb-4">
          <li className="mb-2"><strong>Initial Load:</strong> Server sends minimal HTML shell + JavaScript bundle</li>
          <li className="mb-2"><strong>Client Rendering:</strong> JavaScript fetches data and renders content</li>
          <li className="mb-2"><strong>Crawler Behavior:</strong> Googlebot executes JavaScript and sees the same rendered content as users</li>
        </ol>
        <p className="text-gray-700">
          <strong>Verification:</strong> Google Search Console's URL Inspection tool confirms our pages 
          render correctly for Googlebot.
        </p>
      </section>

      {/* Section 6 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          6. Business Legitimacy
        </h2>
        <table className="w-full border-collapse border border-gray-300">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="border border-gray-300 p-2 font-medium bg-gray-50 w-1/3">Business Name</td>
              <td className="border border-gray-300 p-2">Skidzo (Eenmanszaak / Sole Proprietorship)</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="border border-gray-300 p-2 font-medium bg-gray-50">Chamber of Commerce (KvK)</td>
              <td className="border border-gray-300 p-2">78156955</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="border border-gray-300 p-2 font-medium bg-gray-50">VAT Number (BTW)</td>
              <td className="border border-gray-300 p-2">NL101001964B02</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="border border-gray-300 p-2 font-medium bg-gray-50">Registered Address</td>
              <td className="border border-gray-300 p-2">De Haasstraat 11, 7312 VG Apeldoorn, Netherlands</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium bg-gray-50">Country of Registration</td>
              <td className="border border-gray-300 p-2">The Netherlands</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Section 7 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          7. Technical Evidence Against Cloaking
        </h2>
        <ol className="list-decimal list-inside text-gray-700 ml-4 space-y-2">
          <li><strong>No Server-Side User-Agent Checks:</strong> Our edge functions do not inspect or act upon User-Agent headers to serve different content</li>
          <li><strong>No Conditional Redirects:</strong> No code exists that redirects based on crawler detection</li>
          <li><strong>Transparent URL Structure:</strong> All product URLs use SEO-friendly slugs (e.g., /products/luxury-dog-bed) accessible to all visitors</li>
          <li><strong>Open Source Framework:</strong> React is a widely-used, Google-approved framework</li>
          <li><strong>Consistent Content:</strong> The same database content is served to all users regardless of their browser or user agent</li>
        </ol>
      </section>

      {/* Section 8 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          8. Possible Cause of False Positive
        </h2>
        <p className="mb-4 text-gray-700">
          We identified a <strong>Google Workspace domain mismatch</strong> issue that may have triggered the false positive:
        </p>
        <ul className="list-disc list-inside text-gray-700 ml-4 space-y-2">
          <li>A temporary domain email (<code className="bg-gray-100 px-1">*.appstempdomain.goog</code>) was visible in our Google account during initial setup</li>
          <li>This has been resolved by configuring <code className="bg-gray-100 px-1">support@getpawsy.pet</code> as the primary email</li>
          <li>The temporary domain account has been removed</li>
          <li>Two-step verification has been enabled for security</li>
        </ul>
      </section>

      {/* Section 9 - Request */}
      <section className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-300">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          9. Request for Account Reactivation
        </h2>
        <p className="mb-4 text-gray-700">
          We respectfully request reactivation of our Google Ads account. Our website:
        </p>
        <ul className="list-none text-gray-700 space-y-2 mb-4">
          <li>✅ Delivers consistent content to all visitors (humans and crawlers)</li>
          <li>✅ Uses industry-standard security practices (not cloaking)</li>
          <li>✅ Is operated by a legitimate registered business in the Netherlands</li>
          <li>✅ Has no prior policy violations</li>
          <li>✅ Is verified in Google Search Console with properly indexed pages</li>
        </ul>
        <p className="text-gray-700">
          We are happy to provide additional technical documentation, source code excerpts, 
          or schedule a technical review if needed.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-gray-800 pt-6 mt-8">
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <p><strong>Contact Email:</strong> support@getpawsy.pet</p>
            <p><strong>Website:</strong> https://getpawsy.pet</p>
          </div>
          <div className="text-right">
            <p><strong>Business:</strong> Skidzo</p>
            <p><strong>KvK:</strong> 78156955</p>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">
          Document generated on {new Date().toISOString().split('T')[0]} • GetPawsy.pet Technical Declaration
        </p>
      </footer>
    </div>
  );
};

export default TechnicalDeclaration;
