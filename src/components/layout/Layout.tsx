import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from '../ui/scroll-to-top';
import { PageTransition } from '../ui/page-transition';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col w-full max-w-[100vw] overflow-x-hidden">
      <Navbar />
      <PageTransition>
        <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pb-safe">{children}</main>
      </PageTransition>
      <Footer />
      <ScrollToTop />
    </div>
  );
};
