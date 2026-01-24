import { motion } from 'framer-motion';
import { Truck, Shield, HeartHandshake, Leaf, Sparkles } from 'lucide-react';

const badges = [
  {
    icon: Truck,
    title: 'Free Shipping',
    description: 'On orders over $50',
    color: 'primary',
  },
  {
    icon: Shield,
    title: '30-Day Returns',
    description: 'Hassle-free returns',
    color: 'success',
  },
  {
    icon: HeartHandshake,
    title: 'Pet-Safe',
    description: 'Vet-approved items',
    color: 'accent',
  },
  {
    icon: Leaf,
    title: 'Eco-Friendly',
    description: 'Sustainable products',
    color: 'secondary',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const badgeVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 20,
    },
  },
};

export const AnimatedTrustBadges = () => {
  return (
    <motion.div
      className="py-8 md:py-12 bg-gradient-to-r from-secondary/30 via-background to-accent/30 relative overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
    >
      {/* Animated background sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -10, 0],
              opacity: [0.3, 0.7, 0.3],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 2 + i * 0.3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.2,
            }}
          >
            <Sparkles className="w-4 h-4 text-primary/20" />
          </motion.div>
        ))}
      </div>

      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {badges.map((badge, index) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={badge.title}
                variants={badgeVariants}
                whileHover={{ 
                  scale: 1.05, 
                  y: -5,
                  transition: { type: 'spring', stiffness: 400, damping: 15 }
                }}
                className="trust-badge group relative flex flex-col items-center text-center p-4 md:p-6 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 cursor-default"
              >
                {/* Icon with animated background */}
                <motion.div
                  className={`relative w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mb-3 ${
                    badge.color === 'primary' ? 'bg-primary/10' :
                    badge.color === 'success' ? 'bg-success/10' :
                    badge.color === 'accent' ? 'bg-accent' :
                    'bg-secondary'
                  }`}
                  whileHover={{ rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Pulse ring */}
                  <motion.div
                    className={`absolute inset-0 rounded-2xl ${
                      badge.color === 'primary' ? 'bg-primary/20' :
                      badge.color === 'success' ? 'bg-success/20' :
                      badge.color === 'accent' ? 'bg-accent/50' :
                      'bg-secondary/50'
                    }`}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: index * 0.3,
                    }}
                  />
                  <Icon className={`w-6 h-6 md:w-7 md:h-7 relative z-10 ${
                    badge.color === 'primary' ? 'text-primary' :
                    badge.color === 'success' ? 'text-success' :
                    badge.color === 'accent' ? 'text-accent-foreground' :
                    'text-secondary-foreground'
                  }`} />
                </motion.div>

                {/* Text */}
                <h3 className="font-display font-semibold text-foreground text-sm md:text-base mb-1">
                  {badge.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {badge.description}
                </p>

                {/* Hover glow effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default AnimatedTrustBadges;
