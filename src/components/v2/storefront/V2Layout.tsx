import type { ReactNode } from 'react';
import { V2Header } from './V2Header';
import { V2Footer } from './V2Footer';

/**
 * Commerce V2 storefront shell. Semantic landmarks only, no overlay widgets,
 * no scroll-driven effects — safe for iOS Safari / WebKit.
 */
export function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden bg-background">
      <V2Header />
      <main id="main" className="flex-1 w-full">
        {children}
      </main>
      <V2Footer />
    </div>
  );
}

export default V2Layout;
