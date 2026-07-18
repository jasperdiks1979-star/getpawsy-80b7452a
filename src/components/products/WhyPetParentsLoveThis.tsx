import React from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { getShortBenefits } from './ClarityIntro';
import { getProductContentOverride } from '@/config/product-content-overrides';

interface WhyPetParentsLoveThisProps {
  productId?: string;
  productName: string;
  category: string;
  className?: string;
}

/**
 * "Why pet parents choose this" benefits section
 * 
 * Displays 3-5 benefit-driven bullet points that are:
 * - Scannable
 * - Focused on ease, comfort, peace of mind
 * - Not specs - actual benefits
 * 
 * For cold traffic (Pinterest) who need reassurance
 */
export const WhyPetParentsLoveThis: React.FC<WhyPetParentsLoveThisProps> = ({
  productId,
  productName,
  category,
  className = '',
}) => {
  const override = getProductContentOverride(productId);
  const allBenefits = override?.benefits && override.benefits.length > 0
    ? override.benefits.slice(0, 5)
    : [
        ...getShortBenefits(productName, category),
        'Designed with your pet\'s comfort in mind',
        'Easy to incorporate into daily routines',
      ].slice(0, 5);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className={`bg-secondary/20 rounded-2xl p-5 ${className}`}
    >
      <h3 className="font-display font-semibold text-foreground flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-primary" />
        Why pet parents choose this
      </h3>
      
      <ul className="space-y-2.5">
        {allBenefits.map((benefit, idx) => (
          <motion.li
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + idx * 0.05 }}
            className="flex items-start gap-2.5 text-sm text-muted-foreground"
          >
            <span className="text-primary mt-0.5 flex-shrink-0">•</span>
            <span>{benefit}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
};
