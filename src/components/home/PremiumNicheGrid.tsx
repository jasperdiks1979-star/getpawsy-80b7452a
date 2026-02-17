import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import orthopedicBedsImg from '@/assets/niches/orthopedic-beds.jpg';
import carSafetySeatsImg from '@/assets/niches/car-safety-seats.jpg';
import catFeedersImg from '@/assets/niches/cat-feeders.jpg';
import chewToysImg from '@/assets/niches/chew-toys.jpg';
import groomingVacuumImg from '@/assets/niches/grooming-vacuum.jpg';
import bestsellersImg from '@/assets/niches/bestsellers.jpg';

const niches = [
  {
    slug: 'orthopedic-calming-dog-beds',
    title: 'Orthopedic & Calming Dog Beds',
    benefit: 'Relieve joint pain and anxiety with vet-recommended memory foam beds.',
    trust: 'Vet-recommended picks • Fast US shipping',
    image: orthopedicBedsImg,
    alt: 'Senior golden retriever resting on orthopedic memory foam bed in modern living room',
  },
  {
    slug: 'dog-car-travel-safety-seats',
    title: 'Dog Car Safety Seats',
    benefit: 'Crash-tested comfort so every car ride is safe and stress-free.',
    trust: 'Safety-certified • Free shipping over $35',
    image: carSafetySeatsImg,
    alt: 'Happy dog safely secured in premium car safety seat with golden sunlight',
  },
  {
    slug: 'automatic-cat-feeders',
    title: 'Automatic Cat Feeders',
    benefit: 'Smart portion control for worry-free feeding, even when you\'re away.',
    trust: 'App-controlled • Fast US delivery',
    image: catFeedersImg,
    alt: 'Cat eating from sleek automatic feeder in bright modern kitchen',
  },
  {
    slug: 'indestructible-dog-chew-toys',
    title: 'Indestructible Chew Toys',
    benefit: 'Heavy-duty toys built for power chewers. Vet-approved for dental health.',
    trust: 'Vet-approved • 30-day guarantee',
    image: chewToysImg,
    alt: 'Strong dog playing with durable rubber chew toy outdoors in sunny backyard',
  },
  {
    slug: 'pet-grooming-vacuum-kits',
    title: 'Grooming Vacuum Kits',
    benefit: 'Clip, brush, and vacuum in one step. Captures 99% of loose hair.',
    trust: 'Quiet motors • Loved by pet parents',
    image: groomingVacuumImg,
    alt: 'Owner grooming golden dog with modern grooming vacuum kit in bright interior',
  },
  {
    slug: 'bestsellers',
    title: 'Our Bestsellers',
    benefit: 'The most popular products, hand-picked by thousands of US pet families.',
    trust: 'Top-rated • Curated collection',
    image: bestsellersImg,
    alt: 'Curated premium pet product flat lay with warm lighting',
    isInternal: true,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export const PremiumNicheGrid = () => {
  return (
    <section className="py-20 md:py-28" style={{ background: 'hsl(var(--luxury-bg))' }}>
      <div className="container px-4 md:px-6">
        {/* Section Header */}
        <motion.div
          className="text-center mb-14 md:mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p
            className="text-sm font-medium tracking-[0.2em] uppercase mb-4"
            style={{ color: 'hsl(var(--luxury-accent))' }}
          >
            Curated Collections
          </p>
          <h2
            className="text-3xl md:text-5xl font-display font-bold mb-4 leading-tight"
            style={{ color: 'hsl(var(--luxury-accent-foreground))' }}
          >
            Curated Collections for Modern Pet Homes
          </h2>
          <p
            className="text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'hsl(var(--luxury-muted))' }}
          >
            Comfort, safety & smart solutions — thoughtfully selected for dogs and cats.
          </p>
        </motion.div>

        {/* Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
        >
          {niches.map((niche) => (
            <motion.div key={niche.slug} variants={cardVariants}>
              <Link
                to={niche.isInternal ? `/${niche.slug}` : `/collections/${niche.slug}`}
                className="group block relative overflow-hidden rounded-2xl aspect-[16/10] focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  boxShadow: '0 4px 30px hsl(0 0% 0% / 0.4)',
                }}
              >
                {/* Image with hover zoom */}
                <img
                  src={niche.image}
                  alt={niche.alt}
                  width={1024}
                  height={576}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  style={{ contentVisibility: 'auto' }}
                />

                {/* Dark gradient overlay — heavier on hover */}
                <div
                  className="absolute inset-0 transition-all duration-500"
                  style={{
                    background:
                      'linear-gradient(to top, hsl(0 0% 0% / 0.75) 0%, hsl(0 0% 0% / 0.35) 50%, hsl(0 0% 0% / 0.15) 100%)',
                  }}
                />
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: 'hsl(0 0% 0% / 0.15)',
                  }}
                />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-7">
                  <h3
                    className="font-display font-bold text-xl md:text-2xl mb-2 leading-snug"
                    style={{ color: 'hsl(0 0% 100%)' }}
                  >
                    {niche.title}
                  </h3>
                  <p
                    className="text-sm mb-2 leading-relaxed max-w-[90%]"
                    style={{ color: 'hsl(0 0% 100% / 0.8)' }}
                  >
                    {niche.benefit}
                  </p>
                  <p
                    className="text-xs mb-4"
                    style={{ color: 'hsl(var(--luxury-accent) / 0.9)' }}
                  >
                    {niche.trust}
                  </p>

                  {/* CTA */}
                  <span
                    className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide"
                    style={{ color: 'hsl(var(--luxury-accent))' }}
                  >
                    Explore Collection
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                    {/* Underline animation */}
                    <span
                      className="absolute bottom-6 left-6 md:left-7 h-[1px] w-0 group-hover:w-[140px] transition-all duration-500"
                      style={{ background: 'hsl(var(--luxury-accent))' }}
                    />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
