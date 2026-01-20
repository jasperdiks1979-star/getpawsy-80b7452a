import { motion, Variants } from 'framer-motion';
import { ReactNode } from 'react';

interface StaggeredContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
}

interface StaggeredItemProps {
  children: ReactNode;
  className?: string;
  index?: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.95,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

const itemFadeVariants: Variants = {
  hidden: { 
    opacity: 0, 
    y: 12,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

const itemScaleVariants: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.9,
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.35,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  },
};

export const StaggeredContainer = ({ 
  children, 
  className,
  staggerDelay = 0.08,
  initialDelay = 0.1,
}: StaggeredContainerProps) => {
  const customVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={customVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const StaggeredItem = ({ children, className }: StaggeredItemProps) => {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
};

export const StaggeredFadeItem = ({ children, className }: StaggeredItemProps) => {
  return (
    <motion.div variants={itemFadeVariants} className={className}>
      {children}
    </motion.div>
  );
};

export const StaggeredScaleItem = ({ children, className }: StaggeredItemProps) => {
  return (
    <motion.div variants={itemScaleVariants} className={className}>
      {children}
    </motion.div>
  );
};

// Grid-specific container with optimized stagger for grids
export const StaggeredGrid = ({ 
  children, 
  className,
  staggerDelay = 0.06,
}: StaggeredContainerProps) => {
  const gridVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.05,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-30px" }}
      variants={gridVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// List-specific container with slightly slower stagger
export const StaggeredList = ({ 
  children, 
  className,
  staggerDelay = 0.1,
}: StaggeredContainerProps) => {
  const listVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.08,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-20px" }}
      variants={listVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
};
