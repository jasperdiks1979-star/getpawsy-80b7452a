import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingBag, Search } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { PRIMARY_NAV } from './nav-config';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';
import logo from '@/assets/logo-getpawsy.png';

/**
 * Commerce V2 storefront header.
 *
 * Mobile-first, WebKit-safe: no backdrop blur, no transforms on scroll,
 * no parallax. Sticky via plain `position: sticky` only.
 */
export function V2Header() {
  const [open, setOpen] = useState(false);
  const { totalItems } = useCart();
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const linkBase =
    'inline-flex items-center h-11 px-3 rounded-md text-sm font-medium text-foreground/80 transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <p className="bg-secondary text-secondary-foreground text-center text-xs sm:text-[13px] py-2 px-4 m-0">
        Free US shipping on orders over ${FREE_SHIPPING_THRESHOLD}
      </p>

      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="v2-mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>

        <Link
          to="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="GetPawsy home"
        >
          <img src={logo} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
          <span className="font-display text-lg font-bold tracking-tight text-foreground">GetPawsy</span>
        </Link>

        <nav aria-label="Primary" className="hidden lg:flex flex-1 items-center justify-center gap-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'text-foreground bg-muted' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/products"
            aria-label="Search products"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            to="/cart"
            aria-label={`Cart, ${totalItems} item${totalItems === 1 ? '' : 's'}`}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            {totalItems > 0 && (
              <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-primary px-1 text-[11px] font-semibold leading-[18px] text-primary-foreground">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {open && (
        <nav
          id="v2-mobile-nav"
          aria-label="Mobile"
          className="lg:hidden border-t border-border bg-background"
        >
          <ul className="mx-auto max-w-6xl list-none px-4 py-2 sm:px-6">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className="flex min-h-[56px] flex-col justify-center border-b border-border/60 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-base font-semibold text-foreground">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

export default V2Header;
