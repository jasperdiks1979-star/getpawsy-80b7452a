import { motion } from 'framer-motion';

interface AnimatedHamburgerProps {
  isOpen: boolean;
  className?: string;
}

export const AnimatedHamburger = ({ isOpen, className = '' }: AnimatedHamburgerProps) => {
  const lineProps = {
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
    initial: "closed",
    animate: isOpen ? "open" : "closed",
  };

  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={`w-5 h-5 ${className}`}
      initial={false}
    >
      {/* Top line */}
      <motion.line
        x1="4"
        x2="20"
        y1="6"
        y2="6"
        variants={{
          closed: { y1: 6, y2: 6, rotate: 0 },
          open: { y1: 12, y2: 12, rotate: 45 },
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        {...lineProps}
        style={{ transformOrigin: "center" }}
      />
      
      {/* Middle line */}
      <motion.line
        x1="4"
        x2="20"
        y1="12"
        y2="12"
        variants={{
          closed: { opacity: 1, scaleX: 1 },
          open: { opacity: 0, scaleX: 0 },
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        {...lineProps}
      />
      
      {/* Bottom line */}
      <motion.line
        x1="4"
        x2="20"
        y1="18"
        y2="18"
        variants={{
          closed: { y1: 18, y2: 18, rotate: 0 },
          open: { y1: 12, y2: 12, rotate: -45 },
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        {...lineProps}
        style={{ transformOrigin: "center" }}
      />
    </motion.svg>
  );
};
