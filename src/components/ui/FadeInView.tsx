import { useRef, useEffect, useState, type ReactNode } from 'react';

interface FadeInViewProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}

/**
 * Lightweight IntersectionObserver-based fade-in.
 * Zero-dependency replacement for framer-motion whileInView on the homepage.
 * Reduces initial JS by ~45KB gzip (framer-motion not needed on first paint).
 */
export function FadeInView({ children, className = '', as: Tag = 'div' }: FadeInViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as any}
      className={`${className} transition-all duration-500 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      }`}
    >
      {children}
    </Tag>
  );
}
