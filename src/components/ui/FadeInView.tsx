import { useRef, useEffect, useState, type ReactNode } from 'react';

interface FadeInViewProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
  /**
   * If true, renders children immediately with no animation.
   * Use for above-the-fold content that must paint instantly (LCP elements).
   */
  instant?: boolean;
}

/**
 * Lightweight IntersectionObserver-based fade-in.
 * Zero-dependency replacement for framer-motion whileInView on the homepage.
 * 
 * - Set instant=true for above-fold sections to eliminate any JS/paint delay.
 * - Below-fold sections get a 300ms fade-in via CSS transition.
 */
export function FadeInView({ children, className = '', as: Tag = 'div', instant = false }: FadeInViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  // instant=true or SSR: skip IntersectionObserver entirely
  const [visible, setVisible] = useState(instant);

  useEffect(() => {
    if (instant) return;
    const el = ref.current;
    if (!el) return;
    // If already in viewport on mount (e.g. just below hero), show immediately
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '80px', threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [instant]);

  if (instant) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag
      ref={ref as any}
      className={`${className} transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {children}
    </Tag>
  );
}
