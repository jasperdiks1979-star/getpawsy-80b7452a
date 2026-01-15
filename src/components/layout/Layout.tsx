import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from '../ui/scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};
