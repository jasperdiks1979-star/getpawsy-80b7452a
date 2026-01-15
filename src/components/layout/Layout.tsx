import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from '../ui/scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col w-full max-w-[100vw] overflow-x-hidden">
      <Navbar />
      <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden">{children}</main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};
