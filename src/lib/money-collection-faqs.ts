/**
 * Money Collection FAQs — 3-5 FAQPage schema entries per money collection.
 * Used by SeoCollection.tsx to inject FAQ schema on money collection pages.
 */

export interface MoneyFAQ {
  question: string;
  answer: string;
}

export const MONEY_COLLECTION_FAQS: Record<string, MoneyFAQ[]> = {
  'cat-trees-and-condos': [
    { question: 'What is the best cat tree for large cats?', answer: 'The best cat tree for large cats features solid wood or reinforced frames, 4-inch sisal posts, and platforms at least 18 inches wide. Look for anti-tip hardware and weight ratings of 40 lbs or more for breeds like Maine Coons and Ragdolls.' },
    { question: 'How tall should a cat tree be?', answer: 'Most cats prefer trees at least 5 feet tall to satisfy their climbing instinct. Floor-to-ceiling tension pole models (7–9 ft) are ideal for active cats, while compact 3–4 ft trees work well in apartments.' },
    { question: 'Are cat trees worth the money?', answer: 'Yes. Cat trees reduce destructive scratching on furniture, provide exercise for indoor cats, and decrease stress-related behavior problems. A quality cat tree typically lasts 3–5 years, making it one of the best investments for indoor cat owners.' },
    { question: 'How do I stop my cat tree from wobbling?', answer: 'Use wall anchors or anti-tip straps included with most premium cat trees. Place the tree on a flat, hard surface and ensure all bolts are fully tightened. Trees with wider bases (24 inches+) are inherently more stable.' },
  ],
  'best-cat-litter-boxes': [
    { question: 'What is the best self-cleaning litter box?', answer: 'The best self-cleaning litter boxes use automatic raking or rotating mechanisms to separate clumps from clean litter. Look for models with odor-control carbon filters, large waste drawers, and quiet operation for sensitive cats.' },
    { question: 'How many litter boxes do I need for 2 cats?', answer: 'The general rule is one litter box per cat plus one extra. For 2 cats, you should have 3 litter boxes placed in different locations to prevent territorial issues and ensure each cat always has access.' },
    { question: 'How often should I completely change cat litter?', answer: 'Clumping litter should be scooped daily and completely replaced every 2–4 weeks. Non-clumping litter needs full replacement every week. Self-cleaning boxes extend intervals to 4–6 weeks between full changes.' },
  ],
  'orthopedic-calming-dog-beds': [
    { question: 'Are orthopedic dog beds worth it?', answer: 'Yes, especially for senior dogs, large breeds, and dogs with joint issues. Orthopedic beds with memory foam or high-density support distribute weight evenly, reduce pressure on joints, and can significantly improve sleep quality and mobility.' },
    { question: 'What is the best bed for a dog with anxiety?', answer: 'Calming dog beds with raised rims (bolster design) and soft, plush materials help anxious dogs feel secure. The donut-style calming bed mimics the feeling of being cuddled, which reduces stress hormones in dogs.' },
    { question: 'How thick should an orthopedic dog bed be?', answer: 'A quality orthopedic dog bed should be at least 4 inches thick for small dogs and 6–8 inches for large breeds over 50 lbs. The foam density should be 3–5 lbs per cubic foot to provide lasting support without bottoming out.' },
    { question: 'Can orthopedic dog beds help with hip dysplasia?', answer: 'Yes. Orthopedic memory foam beds are recommended by veterinarians for dogs with hip dysplasia because they reduce pressure on the hip joint, improve blood circulation, and provide consistent support that does not flatten over time.' },
  ],
  'best-dog-harnesses': [
    { question: 'What is the best no-pull dog harness?', answer: 'The best no-pull harnesses feature a front-clip attachment that redirects your dog toward you when they pull. Look for padded chest plates, adjustable straps, and reflective stitching. Avoid harnesses that restrict shoulder movement.' },
    { question: 'Is a harness better than a collar for walking?', answer: 'For most dogs, yes. Harnesses distribute force across the chest instead of the neck, reducing risk of tracheal damage. They are especially important for brachycephalic breeds, puppies, and dogs that pull on walks.' },
    { question: 'How do I measure my dog for a harness?', answer: 'Measure your dog\'s chest girth (widest part of the ribcage, just behind the front legs) and neck circumference. Most harnesses are sized by chest girth. Always check the manufacturer\'s size chart and choose adjustable designs for the best fit.' },
  ],
  'best-dog-car-seats': [
    { question: 'Are dog car seats safe?', answer: 'Crash-tested dog car seats significantly improve safety during travel. Look for models that have passed FMVSS or independent crash tests, with reinforced frames and secure tether systems that attach to your car\'s LATCH or seatbelt anchors.' },
    { question: 'What size dog car seat do I need?', answer: 'Measure your dog\'s length (nose to tail base) and weight. Most car seats are rated by weight class: small (up to 20 lbs), medium (20–40 lbs), and large (40–60 lbs). Your dog should be able to sit and lie down comfortably inside.' },
    { question: 'Can I use a dog car seat in the front seat?', answer: 'It\'s safest to use dog car seats in the back seat, just like child car seats. If you must use the front seat, disable the airbag. The back seat provides better crash protection and reduces driver distraction.' },
  ],
  'best-interactive-dog-toys': [
    { question: 'What are the best puzzle toys for dogs?', answer: 'The best puzzle toys challenge your dog mentally with treat-dispensing mechanisms, sliding compartments, and multi-step solutions. Start with Level 1 puzzles for beginners and progress to advanced toys as your dog improves.' },
    { question: 'How long should a dog play with puzzle toys?', answer: '15–30 minutes of puzzle play is typically enough for one session. Rotate between 3–4 different puzzles weekly to prevent boredom. Supervision is recommended, especially with destructive chewers.' },
    { question: 'Are interactive toys good for dogs with separation anxiety?', answer: 'Yes. Treat-dispensing and puzzle toys provide mental stimulation that can reduce anxiety when you leave. Fill a Kong-style toy with frozen peanut butter for 30–45 minutes of calming engagement.' },
  ],
  'best-cat-scratching-posts': [
    { question: 'What is the best material for a cat scratching post?', answer: 'Sisal rope is the most durable and preferred material for scratching posts. Sisal fabric (flat weave) is also excellent. Cardboard scratchers are affordable but need frequent replacement. Avoid carpet-covered posts as cats may learn to scratch household carpet.' },
    { question: 'How tall should a scratching post be?', answer: 'A scratching post should be at least 32 inches tall so your cat can fully stretch while scratching. For large cats, 36–40 inches is ideal. The post must be stable enough not to wobble during vigorous scratching.' },
    { question: 'How do I get my cat to use a scratching post?', answer: 'Place the post near where your cat already scratches. Use catnip spray or treats on the post. Never force your cat\'s paws onto it. Reward your cat when they use the post, and temporarily cover furniture with double-sided tape.' },
  ],
  'best-slow-feeder-dog-bowls': [
    { question: 'Do slow feeder bowls really work for dogs?', answer: 'Yes. Studies show slow feeder bowls can increase eating time by 5–10x, reducing the risk of bloat (GDV), improving digestion, and preventing vomiting after meals. They are recommended by veterinarians for dogs that gulp their food.' },
    { question: 'What is the best slow feeder for large dogs?', answer: 'Large dogs need slow feeders with deep ridges and wider dimensions (10+ inches). Look for non-slip bases, food-safe materials, and dishwasher-safe designs. Avoid feeders with small compartments that frustrate large breeds.' },
    { question: 'Can slow feeders cause frustration in dogs?', answer: 'Start with a simple pattern and gradually introduce more complex designs. If your dog seems stressed, try a lick mat or puzzle feeder instead. Most dogs adapt within 2–3 meals and enjoy the enrichment.' },
  ],
  'best-cat-carriers': [
    { question: 'What is the best airline-approved cat carrier?', answer: 'The best airline-approved cat carriers are soft-sided, measure under 18" x 11" x 11" for under-seat storage, and have mesh ventilation on at least 3 sides. Check your specific airline\'s pet policy as dimensions vary.' },
    { question: 'How do I get my cat used to a carrier?', answer: 'Leave the carrier open at home with a familiar blanket inside. Place treats and toys inside daily. Start with short sessions and gradually increase time. Use Feliway spray to create calming pheromone associations.' },
    { question: 'Should I get a hard or soft cat carrier?', answer: 'Soft carriers are better for airline travel and vet visits (lighter, collapsible). Hard carriers are better for car travel and multi-cat households (more structural protection, easier to clean). Consider your primary use case.' },
  ],
  'best-interactive-cat-toys': [
    { question: 'What are the best toys for indoor cats?', answer: 'The best indoor cat toys combine hunting simulation (feather wands, laser pointers), puzzle feeding (treat balls, puzzle boards), and independent play (electronic mice, automated laser toys). Rotate toys weekly to maintain interest.' },
    { question: 'Are laser toys safe for cats?', answer: 'Laser toys are safe when used properly. Never shine the laser directly in your cat\'s eyes. Always end laser play by directing the dot to a physical toy or treat so your cat gets the satisfaction of a "catch" — this prevents frustration.' },
    { question: 'How much playtime do indoor cats need?', answer: 'Indoor cats need 20–30 minutes of active play per day, split into 2–3 sessions. Interactive play mimicking hunting (stalk, chase, pounce, catch) is most satisfying. Pair with puzzle feeders for mental stimulation between play sessions.' },
  ],
  'dog-potty-training': [
    { question: 'How long does it take to potty train a dog?', answer: 'Most dogs achieve reliable housebreaking within 4–6 weeks with consistent training. Puppies under 6 months take longer due to smaller bladders. Adult rescue dogs may need 2–4 weeks to learn new routines.' },
    { question: 'Are grass pads better than pee pads?', answer: 'Grass pads simulate outdoor conditions, making the transition to outdoor elimination easier. Pee pads work as temporary solutions but may confuse dogs about acceptable indoor elimination spots.' },
    { question: 'Why does my potty-trained dog have accidents?', answer: 'Sudden regression can indicate a UTI, anxiety, or major routine change. Rule out medical causes with your vet first. Environmental triggers like new pets or moving can cause temporary setbacks.' },
    { question: 'Is crate training necessary for potty training?', answer: 'Crate training is the most effective housebreaking method because it leverages a dog\'s natural instinct to keep their sleeping area clean. The crate should be just large enough to stand, turn, and lie down.' },
  ],
  'dog-leash-control': [
    { question: 'How do I stop my dog from pulling on the leash?', answer: 'Use a front-clip no-pull harness and the stop-and-redirect method: when your dog pulls, stop completely. Wait until the leash is loose, then continue. Reward loose-leash walking with treats. Most dogs improve within 1–2 weeks.' },
    { question: 'Are no-pull harnesses safe for dogs?', answer: 'Yes, properly fitted no-pull harnesses are safe and vet-recommended. Front-clip designs redirect force across the chest without neck pressure. Ensure the harness doesn\'t restrict shoulder movement.' },
    { question: 'What length leash is best for training?', answer: 'A 4–6 foot fixed-length leash is ideal. Shorter leashes restrict movement; longer ones give too much freedom. Avoid retractable leashes during training — they teach dogs that pulling extends range.' },
    { question: 'How long does leash training take?', answer: 'Most dogs show improvement within 2–3 weeks of daily practice with proper equipment. Full reliability typically takes 4–8 weeks depending on age, breed, and how ingrained the pulling habit is.' },
  ],
  'dog-anti-bark': [
    { question: 'Are ultrasonic bark deterrents effective?', answer: 'Yes — ultrasonic devices interrupt bark patterns with high-frequency sound. Studies show 70–80% effectiveness paired with positive reinforcement. Best for alert barking; less effective for anxiety-driven barking.' },
    { question: 'Are anti-bark collars safe for dogs?', answer: 'Humane collars using vibration, citronella, or ultrasonic sound are safe. Avoid shock collars — they cause fear and aggression. Look for automatic shut-off features to prevent overstimulation.' },
    { question: 'How do I stop my dog barking at night?', answer: 'Night barking is usually caused by anxiety, outdoor noises, or needing to go outside. Use white noise, ensure adequate daytime exercise, and create a calm sleep environment. Anti-bark devices with bedtime routines work well.' },
    { question: 'Can excessive barking indicate a health problem?', answer: 'Yes. Sudden changes in barking can indicate pain, cognitive decline in seniors, or hearing loss. If barking patterns change suddenly, consult your vet before trying behavioral interventions.' },
  ],
  'puppy-essentials': [
    { question: 'What does a new puppy need in the first week?', answer: 'A properly sized crate, food/water bowls, potty training pads, a lightweight collar with ID tag, 2–3 chew toys, enzymatic cleaner, and a quiet sleeping area. Keep the environment calm and predictable.' },
    { question: 'When should I start training my puppy?', answer: 'Start the day you bring your puppy home. Puppies can learn basic commands like sit and name recognition as early as 8 weeks. Formal obedience classes typically begin at 12–16 weeks.' },
    { question: 'What chew toys are safe for puppies?', answer: 'Safe chew toys are made from non-toxic rubber or nylon with no small detachable parts. Match hardness to age — softer for teething puppies under 6 months. Avoid toys that can be shredded into pieces.' },
    { question: 'How do I stop my puppy from biting everything?', answer: 'Puppy mouthing is normal behavior, not aggression. Redirect biting to appropriate chew toys, reward correct chewing, and briefly disengage when they bite skin. Most puppies outgrow it by 6–7 months.' },
  ],
  'dog-training-accessories': [
    { question: 'Do dog training clickers really work?', answer: 'Yes. Clicker training is scientifically validated — the precise marker sound tells your dog exactly which behavior earned the reward. Dogs trained with clickers learn new behaviors up to 50% faster than verbal-only methods.' },
    { question: 'What treats are best for dog training?', answer: 'Small (pea-sized), soft, smelly, high-value treats work best. Freeze-dried liver, cheese cubes, and commercial training treats are popular. Avoid hard biscuits that take too long to chew during sessions.' },
    { question: 'How long should training sessions be?', answer: 'Keep sessions 5–10 minutes for puppies, 10–15 minutes for adults, 2–3 times daily. Short frequent sessions outperform long infrequent ones. Always end on a success.' },
    { question: 'What is the best age to start training?', answer: 'Training should start immediately, regardless of age. Puppies as young as 8 weeks can learn through positive reinforcement. Older dogs are equally trainable and often learn faster due to better focus.' },
  ],
};

/** Get FAQs for a money collection slug, or empty array */
export function getMoneyCollectionFAQs(slug: string): MoneyFAQ[] {
  return MONEY_COLLECTION_FAQS[slug] || [];
}
