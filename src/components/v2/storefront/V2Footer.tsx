import { Link } from 'react-router-dom';
import { SHOP_NAV, SUPPORT_NAV, POLICY_NAV } from './nav-config';
import {
  SUPPORT_EMAIL,
  BUSINESS_NAME,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  FREE_SHIPPING_THRESHOLD,
} from '@/lib/shipping-constants';

const linkClass =
  'inline-flex min-h-[36px] items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded';

function Column({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">{title}</h2>
      <ul className="list-none p-0 m-0">
        {items.map((i) => (
          <li key={i.href}>
            <Link to={i.href} className={linkClass}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function V2Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <p className="font-display text-lg font-bold text-foreground">{BUSINESS_NAME}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Practical pet supplies for US households — selected for everyday comfort and durability.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-3 inline-flex min-h-[36px] items-center text-sm font-medium text-primary hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>

        <Column title="Shop" items={SHOP_NAV} />
        <Column title="Support" items={SUPPORT_NAV} />
        <Column title="Policies" items={POLICY_NAV} />
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="m-0">
            © {new Date().getFullYear()} {BUSINESS_NAME}. All rights reserved.
          </p>
          <p className="m-0">
            Free shipping over ${FREE_SHIPPING_THRESHOLD} · Estimated delivery {DELIVERY_TIME_STANDARD} ·{' '}
            {RETURN_WINDOW_DAYS}-day returns
          </p>
        </div>
      </div>
    </footer>
  );
}

export default V2Footer;
