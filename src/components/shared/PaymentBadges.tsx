import React from 'react';

/**
 * Inline SVG payment brand icons - compact, recognizable logos.
 */
const VisaIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.66 1.2L16.26 14.8H13.16L16.56 1.2H19.66ZM33.46 9.84L35.06 5.04L35.96 9.84H33.46ZM36.86 14.8H39.76L37.26 1.2H34.66C34.06 1.2 33.56 1.56 33.36 2.08L28.76 14.8H31.96L32.56 12.96H36.46L36.86 14.8ZM29.06 10.08C29.08 6.56 24.16 6.36 24.2 4.76C24.2 4.24 24.72 3.68 25.84 3.52C26.4 3.44 27.96 3.38 29.72 4.2L30.38 1.56C29.44 1.2 28.24 0.86 26.76 0.86C23.76 0.86 21.62 2.48 21.6 4.76C21.56 6.48 23.12 7.44 24.3 8.02C25.52 8.62 25.94 9 25.94 9.56C25.92 10.4 24.92 10.76 24 10.78C22.02 10.82 20.88 10.26 20 9.82L19.32 12.56C20.22 12.98 21.88 13.36 23.6 13.38C26.8 13.38 28.94 11.78 29.06 10.08ZM12.7 1.2L7.84 14.8H4.62L2.24 3.64C2.1 3.04 1.98 2.82 1.52 2.56C0.78 2.14 -0.02 1.76 -0.02 1.76L0.06 1.2H5.18C5.82 1.2 6.4 1.64 6.54 2.38L7.78 9.22L10.94 1.2H12.7Z" fill="currentColor"/>
  </svg>
);

const MastercardIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.5" cy="8" r="7" fill="#EB001B" opacity="0.8"/>
    <circle cx="15.5" cy="8" r="7" fill="#F79E1B" opacity="0.8"/>
    <path d="M12 2.4C13.42 3.54 14.35 5.28 14.35 7.24C14.35 7.5 14.33 7.75 14.3 8C14.33 8.25 14.35 8.5 14.35 8.76C14.35 10.72 13.42 12.46 12 13.6C10.58 12.46 9.65 10.72 9.65 8.76C9.65 8.5 9.67 8.25 9.7 8C9.67 7.75 9.65 7.5 9.65 7.24C9.65 5.28 10.58 3.54 12 2.4Z" fill="#FF5F00" opacity="0.9"/>
  </svg>
);

const AmexIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="12" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#006FCF" letterSpacing="-0.5">AMEX</text>
  </svg>
);

const ApplePayIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 50 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.43 2.85C8.93 2.24 9.27 1.41 9.18 0.56C8.46 0.59 7.58 1.04 7.06 1.65C6.6 2.18 6.18 3.05 6.29 3.86C7.1 3.92 7.91 3.44 8.43 2.85Z" fill="currentColor"/>
    <path d="M9.17 4.01C7.96 3.94 6.93 4.68 6.36 4.68C5.78 4.68 4.88 4.04 3.9 4.06C2.65 4.08 1.5 4.76 0.86 5.86C-0.44 8.08 0.54 11.38 1.8 13.2C2.42 14.1 3.16 15.1 4.14 15.06C5.08 15.02 5.44 14.44 6.58 14.44C7.72 14.44 8.04 15.06 9.04 15.04C10.06 15.02 10.7 14.14 11.32 13.24C12.04 12.2 12.34 11.2 12.36 11.14C12.34 11.12 10.28 10.32 10.26 7.94C10.24 5.94 11.88 5 11.96 4.94C11.02 3.56 9.56 3.96 9.17 4.01Z" fill="currentColor"/>
    <text x="14" y="13" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif" fill="currentColor">Pay</text>
  </svg>
);

const PayPalIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="12.5" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="-0.3">
      <tspan fill="#003087">Pay</tspan><tspan fill="#009CDE">Pal</tspan>
    </text>
  </svg>
);

const StripeIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 50 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="14" fontSize="12" fontWeight="700" fontFamily="system-ui, sans-serif" fill="#635BFF" letterSpacing="-0.3">stripe</text>
  </svg>
);

const GooglePayIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 56 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="14" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">
      <tspan fill="#4285F4">G</tspan><tspan fill="currentColor"> Pay</tspan>
    </text>
  </svg>
);

const badges: PaymentBadge[] = [
  { name: 'Visa', icon: VisaIcon, width: 'w-10' },
  { name: 'Mastercard', icon: MastercardIcon, width: 'w-6' },
  { name: 'Amex', icon: AmexIcon, width: 'w-10' },
  { name: 'Apple Pay', icon: ApplePayIcon, width: 'w-10' },
  { name: 'Google Pay', icon: GooglePayIcon, width: 'w-11' },
  { name: 'PayPal', icon: PayPalIcon, width: 'w-12' },
  { name: 'Stripe', icon: StripeIcon, width: 'w-10' },
];

interface PaymentBadgesProps {
  /** 'light' for dark backgrounds (footer), 'dark' for light backgrounds */
  variant?: 'light' | 'dark';
  /** Show label prefix */
  showLabel?: boolean;
  label?: string;
  className?: string;
  /** Which methods to show (by name). Defaults to all. */
  methods?: string[];
}

export const PaymentBadges: React.FC<PaymentBadgesProps> = ({
  variant = 'dark',
  showLabel = true,
  label = 'Secure payments:',
  className = '',
  methods,
}) => {
  const filtered = methods
    ? badges.filter(b => methods.includes(b.name))
    : badges;

  const labelColor = variant === 'light' ? 'text-background/40' : 'text-muted-foreground';
  const badgeBg = variant === 'light' ? 'bg-background/10' : 'bg-muted';
  const badgeBorder = variant === 'light' ? '' : 'border border-border';
  const iconColor = variant === 'light' ? 'text-background/70' : 'text-foreground/70';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {showLabel && (
        <span className={`text-xs ${labelColor}`}>{label}</span>
      )}
      {filtered.map(({ name, icon: Icon, width }) => (
        <span
          key={name}
          className={`inline-flex items-center justify-center h-6 px-2 rounded ${badgeBg} ${badgeBorder} ${iconColor}`}
          title={name}
          aria-label={name}
        >
          <Icon className={`${width} h-4`} />
        </span>
      ))}
    </div>
  );
};

export default PaymentBadges;
