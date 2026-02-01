-- Create SEO Collections table for high-intent landing pages
CREATE TABLE public.seo_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  primary_keyword VARCHAR(255) NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',
  seo_intro TEXT NOT NULL,
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  faq JSONB DEFAULT '[]',
  related_blog_slug VARCHAR(255),
  related_collection_slugs TEXT[] DEFAULT '{}',
  product_category_filter VARCHAR(255),
  product_keyword_filter VARCHAR(255),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seo_collections ENABLE ROW LEVEL SECURITY;

-- Public read access for SEO collections
CREATE POLICY "SEO collections are publicly readable"
ON public.seo_collections
FOR SELECT
USING (is_active = true);

-- Admin write access
CREATE POLICY "Admins can manage SEO collections"
ON public.seo_collections
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND email IN ('admin@getpawsy.pet', 'info@getpawsy.com')
  )
);

-- Create index for slug lookups
CREATE INDEX idx_seo_collections_slug ON public.seo_collections(slug);
CREATE INDEX idx_seo_collections_active ON public.seo_collections(is_active);

-- Create trigger for updated_at
CREATE TRIGGER update_seo_collections_updated_at
BEFORE UPDATE ON public.seo_collections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the 3 SEO collections
INSERT INTO public.seo_collections (
  slug,
  name,
  primary_keyword,
  secondary_keywords,
  seo_intro,
  meta_title,
  meta_description,
  faq,
  product_category_filter,
  product_keyword_filter,
  display_order
) VALUES
-- Collection 1: Dog Travel Accessories
(
  'dog-travel-accessories',
  'Dog Travel Accessories',
  'dog travel accessories',
  ARRAY['dog car safety products', 'dog hammock for car', 'dog back seat cover', 'pet travel gear', 'dog car seat', 'travel crate for dogs'],
  'Every road trip with your furry best friend should be safe, comfortable, and stress-free. Whether you''re heading to the vet, the dog park, or a weekend adventure, the right travel gear makes all the difference. At GetPawsy, we understand that pet parents want products that protect their dogs while keeping their car interior clean and scratch-free. Our curated selection of dog travel accessories is designed with both safety and convenience in mind—from protective seat covers that guard against muddy paws to secure harnesses that keep your pup safely in place. Travel smarter, not harder, with gear that''s built for real adventures.',
  'Dog Travel Accessories 2025 | Car Safety & Comfort',
  'Shop premium dog travel accessories. Seat covers, car hammocks & safety harnesses for stress-free road trips. Free US shipping over $35.',
  '[
    {"question": "Why are dog travel accessories important?", "answer": "Dog travel accessories protect both your pet and your car. A proper seat cover prevents scratches and stains, while safety harnesses keep your dog secure during sudden stops—reducing injury risk by up to 80%."},
    {"question": "How do I choose the right car seat cover for my dog?", "answer": "Consider your dog''s size, your car type, and ease of cleaning. Waterproof, non-slip materials work best. Hammock-style covers offer extra protection by blocking the foot area."},
    {"question": "Are dog car harnesses legally required?", "answer": "While laws vary by state, unrestrained pets can be a driving distraction. Safety harnesses protect your dog in case of accidents and may lower insurance liability."},
    {"question": "Can large dogs use car seat covers?", "answer": "Yes! Most quality seat covers are designed to support dogs of all sizes. Look for reinforced stitching and weight ratings for extra durability with larger breeds."}
  ]'::jsonb,
  'Dogs',
  'travel,car,seat,harness,carrier',
  1
),
-- Collection 2: Indoor Cat Enrichment
(
  'indoor-cat-enrichment',
  'Indoor Cat Enrichment',
  'indoor cat enrichment',
  ARRAY['indoor cat toys', 'boredom toys for cats', 'enrichment toys for indoor cats', 'cat mental stimulation', 'interactive cat toys', 'cat puzzle feeders'],
  'Indoor cats live safer lives, but without proper stimulation, they can become bored, anxious, or overweight. The solution? Enrichment that taps into their natural hunting instincts. From interactive puzzle feeders that challenge their minds to climbing towers that satisfy their urge to explore, the right enrichment toys transform your home into a feline playground. At GetPawsy, we believe every cat deserves mental stimulation and physical activity—no matter how small their territory. Our collection is carefully selected to keep your indoor cat engaged, healthy, and genuinely happy. Because a stimulated cat is a content cat.',
  'Indoor Cat Enrichment Toys 2025 | Keep Cats Happy',
  'Discover indoor cat enrichment toys that fight boredom. Puzzle feeders, climbing towers & interactive toys. Free US shipping over $35.',
  '[
    {"question": "Why is enrichment important for indoor cats?", "answer": "Indoor cats miss out on hunting and exploring. Without enrichment, they can develop behavioral issues like scratching furniture, overeating, or excessive meowing. Enrichment toys channel their energy positively."},
    {"question": "What are the best types of enrichment for indoor cats?", "answer": "A mix works best: puzzle feeders for mental stimulation, interactive wand toys for hunting instincts, vertical spaces like cat trees for climbing, and rotating toys to prevent boredom."},
    {"question": "How often should I rotate my cat''s toys?", "answer": "Rotate toys every 1-2 weeks. Putting away some toys and reintroducing them later makes them feel ''new'' again, keeping your cat interested without buying new items constantly."},
    {"question": "Can enrichment help with cat anxiety?", "answer": "Absolutely. Mental stimulation reduces stress hormones. Puzzle feeders slow eating (reducing anxiety-related overeating), while interactive play builds confidence and burns excess energy."}
  ]'::jsonb,
  'Cats',
  'toy,puzzle,interactive,enrichment,play,tower',
  2
),
-- Collection 3: No-Spill Dog Feeding
(
  'no-spill-dog-feeding',
  'No-Spill Dog Bowls & Feeders',
  'no spill dog bowls',
  ARRAY['elevated dog bowls', 'mess free dog feeder', 'slow feeder dog bowl', 'anti-splash water bowl', 'raised dog bowl', 'spill-proof dog dishes'],
  'Mealtime shouldn''t mean cleanup time. If you''re tired of water puddles, scattered kibble, and bowls sliding across the floor, you''re not alone. Messy eating isn''t just annoying—it can also lead to digestive issues when dogs gulp food too fast. Our collection of no-spill dog bowls and feeders solves both problems. From elevated designs that promote healthier posture to slow feeders that prevent bloating, these products are engineered for real-life dog owners. Say goodbye to constantly mopping up spills and hello to stress-free feeding sessions. Your floors (and your dog''s digestion) will thank you.',
  'No-Spill Dog Bowls & Slow Feeders 2025 | GetPawsy',
  'Shop no-spill dog bowls & mess-free feeders. Elevated, slow-feed & anti-splash designs for cleaner mealtimes. Free US shipping over $35.',
  '[
    {"question": "Why are no-spill dog bowls important?", "answer": "No-spill bowls prevent water from splashing everywhere, keeping floors dry and reducing slip hazards. They''re especially helpful for enthusiastic drinkers and breeds with long ears or beards."},
    {"question": "How do elevated dog bowls help with digestion?", "answer": "Elevated bowls reduce neck strain and promote a more natural eating posture. For large breeds, this can decrease the risk of bloat and make swallowing easier, especially for older dogs with arthritis."},
    {"question": "What is a slow feeder bowl and does my dog need one?", "answer": "Slow feeders have ridges or mazes that make dogs work for their food, slowing eating by 5-10x. This prevents gulping, reduces bloating risk, and provides mental stimulation. Great for fast eaters!"},
    {"question": "Are these bowls dishwasher safe?", "answer": "Most of our stainless steel and silicone bowls are dishwasher safe. Check individual product descriptions for care instructions. Regular cleaning prevents bacteria buildup."}
  ]'::jsonb,
  'Dogs',
  'bowl,feeder,feeding,water,food,slow',
  3
);