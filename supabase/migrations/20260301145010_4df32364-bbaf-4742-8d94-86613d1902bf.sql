
-- 1. Create puppy-essentials collection
INSERT INTO public.seo_collections (slug, name, primary_keyword, secondary_keywords, meta_title, meta_description, seo_intro, faq, related_blog_slug, related_collection_slugs, product_category_filter, product_keyword_filter, display_order, is_active)
VALUES (
  'puppy-essentials',
  'Puppy Essentials — Everything for Your New Puppy',
  'puppy training essentials',
  ARRAY['new puppy checklist', 'puppy starter kit', 'puppy supplies must haves', 'first time puppy owner', 'puppy training tools', 'new puppy essentials 2026'],
  'Puppy Training Essentials – Complete New Puppy Kit (2026)',
  'Shop puppy essentials: training pads, chew toys, crates & starter kits. Everything first-time puppy owners need. Free US shipping $49+.',
  '## Bringing Home a New Puppy: What You Actually Need

Bringing home a new puppy is one of life''s most exciting moments — and one of the most overwhelming. Between the conflicting advice online and the endless product options, most first-time puppy owners end up buying too much of the wrong stuff and too little of what actually matters.

The truth? A well-prepared puppy setup doesn''t require dozens of products. It requires the **right** products, chosen with your puppy''s developmental stage in mind.

### Why the First 90 Days Matter Most

Canine behaviorists agree: the first 90 days of a puppy''s life in your home set the foundation for their adult behavior. During this critical window, your puppy is forming associations with their environment, learning boundaries, and developing confidence.

The tools you provide during this period — from crate design to chew toy texture — directly influence whether your puppy develops healthy habits or problematic behaviors like destructive chewing, separation anxiety, and housebreaking regression.

### Common First-Time Puppy Owner Mistakes

Most new puppy parents make predictable mistakes that are easily avoided with the right preparation:

- **Skipping crate training**: A properly sized crate isn''t punishment — it''s your puppy''s safe space and the fastest path to reliable housebreaking.
- **Wrong-size equipment**: Collars, harnesses, and bowls that don''t fit properly create negative associations with wearing gear.
- **Too many toys at once**: Puppies do better with 3–4 rotating toys than a toy box full of options. Rotation keeps novelty high.
- **Ignoring teething needs**: Between 3–6 months, puppies **need** to chew. Providing appropriate chew toys prevents furniture destruction.
- **Delaying socialization**: The socialization window closes around 14 weeks. Puppy-safe exposure tools (carriers, treat pouches) make the process easier.

### What Professional Trainers Recommend

Professional dog trainers consistently recommend a core set of essentials for new puppies:

1. **A correctly sized crate** — just large enough for your puppy to stand, turn, and lie down
2. **Training treats and a treat pouch** — for positive reinforcement from day one
3. **Enzymatic cleaner** — accidents will happen; proper cleanup prevents repeat marking
4. **Age-appropriate chew toys** — different textures for different teething stages
5. **A lightweight collar and leash** — for early leash introduction (before harness training)
6. **Potty training pads** — as a backup, especially for apartment dwellers

### Choosing the Right Products for Your Puppy''s Size

Not all puppy supplies are universal. A Great Dane puppy at 12 weeks already weighs more than an adult Chihuahua. Size-appropriate gear matters for safety and comfort:

- **Small breeds (under 15 lbs adult)**: Look for XS/S crates, soft-textured toys, and shallow food bowls
- **Medium breeds (15–50 lbs adult)**: Standard sizing works well; invest in adjustable harnesses that grow with your pup
- **Large breeds (50+ lbs adult)**: Start with larger crates with dividers, heavy-duty chew toys, and raised food bowls to prevent strain

### Why US-Based Fulfillment Matters for Puppy Supplies

When you''re preparing for a new puppy — or dealing with an unexpected behavioral issue — you can''t wait 3 weeks for shipping. All products in our puppy essentials collection ship from US fulfillment centers with 3–5 business day delivery, so you''re always prepared.

### Our Selection Standard

Every product in this collection is evaluated against our puppy safety criteria: non-toxic materials, no small detachable parts for chew toys, proper ventilation for crates, and positive-reinforcement compatibility. We don''t stock aversive training tools or products that rely on pain or fear.',
  '[
    {"question": "What does a new puppy need in the first week?", "answer": "In the first week, your puppy needs a properly sized crate, food and water bowls, age-appropriate food, potty training pads, a lightweight collar with ID tag, 2-3 chew toys, enzymatic cleaner for accidents, and a quiet sleeping area. Keep the environment calm and predictable."},
    {"question": "When should I start training my puppy?", "answer": "Start basic training immediately — from the day you bring your puppy home. Puppies can learn simple commands like sit and name recognition as early as 8 weeks. Formal obedience classes typically begin at 12-16 weeks after initial vaccinations are complete."},
    {"question": "How long does it take to potty train a puppy?", "answer": "Most puppies achieve reliable housebreaking by 4-6 months with consistent training. Small breeds may take longer due to smaller bladders. The keys are a consistent schedule, positive reinforcement for outdoor elimination, and enzymatic cleanup of indoor accidents."},
    {"question": "What size crate should I get for my puppy?", "answer": "Choose a crate that allows your puppy to stand, turn around, and lie down comfortably. For growing puppies, buy an adult-sized crate with a divider panel that you can adjust as your puppy grows. The crate should never be so large that your puppy can eliminate in one corner."},
    {"question": "Are puppy training pads a good idea?", "answer": "Training pads are useful for apartment dwellers, very young puppies, and during extreme weather. However, they should be a temporary bridge to outdoor elimination. Transition to outdoor-only training by gradually moving the pad closer to the door over 2-3 weeks."},
    {"question": "What chew toys are safe for puppies?", "answer": "Safe puppy chew toys are made from non-toxic rubber, nylon, or natural materials with no small detachable parts. Avoid toys that can be shredded into pieces or those made with BPA. Match toy hardness to your puppy''s age — softer for teething puppies under 6 months."},
    {"question": "How do I stop my puppy from biting everything?", "answer": "Puppy mouthing is normal developmental behavior, not aggression. Redirect biting to appropriate chew toys, use positive reinforcement when they chew correctly, and briefly disengage (turn away) when they bite skin. Most puppies outgrow excessive mouthing by 6-7 months with consistent redirection."},
    {"question": "What is the best age to get a puppy?", "answer": "The ideal age to bring home a puppy is 8-10 weeks. Before 8 weeks, puppies learn critical social skills from their mother and littermates. Puppies adopted too early may develop behavioral issues. Some breeders keep puppies until 10-12 weeks for additional socialization."}
  ]'::jsonb,
  NULL,
  ARRAY['dog-potty-training', 'dog-training-accessories', 'dog-leash-control'],
  'Puppy',
  'puppy,new puppy,starter,essentials,first,pup',
  15,
  true
);

-- 2. Update dog-potty-training with long-form intro and enhanced meta
UPDATE public.seo_collections SET
  meta_title = 'Dog Potty Training Supplies – Best Pads & Solutions (2026)',
  meta_description = 'Shop professional dog potty training tools: grass pads, indoor toilets & training sprays. Vet-recommended housebreaking solutions. Free US shipping $49+.',
  secondary_keywords = ARRAY['puppy potty training', 'indoor dog toilet', 'dog training pads', 'housebreaking supplies', 'grass pad for dogs', 'potty training schedule'],
  seo_intro = '## Why Potty Training Fails — And How the Right Tools Fix It

Housebreaking is the #1 challenge for new dog owners, and the most common reason dogs are surrendered to shelters in their first year. Yet potty training doesn''t have to be a months-long struggle. With the right tools and a consistent approach, most dogs can achieve reliable housebreaking within 4–6 weeks.

The problem isn''t your dog — it''s usually the method. Punishment-based approaches (rubbing a dog''s nose in accidents, yelling) actually **slow down** the training process by creating anxiety around elimination. Dogs trained with fear don''t learn where to go — they learn to hide when they need to go.

### The Science Behind Successful Housebreaking

Dogs naturally avoid eliminating where they sleep and eat. This instinct is the foundation of all effective potty training methods. Professional trainers leverage this behavior using three core tools:

- **Crate training**: Creates a defined "den" space that triggers the dog''s natural cleanliness instinct
- **Designated potty areas**: Grass pads, pee pads, or outdoor stations that establish a consistent target location
- **Enzymatic cleaners**: Completely remove scent markers that would otherwise signal "this is a bathroom spot"

### Common Potty Training Mistakes That Cost Weeks

Most housebreaking setbacks come from predictable errors:

- **Inconsistent schedule**: Dogs need predictable bathroom breaks — after meals, after naps, after play, and every 2–3 hours for puppies under 6 months
- **Too much freedom too soon**: Giving an untrained dog access to the whole house invites accidents. Gradual room-by-room access works better
- **Wrong cleanup products**: Standard cleaners mask odors from humans but not from dogs. Only enzymatic cleaners break down urine proteins
- **Punishing accidents after the fact**: Dogs can only connect consequences to actions within 1–2 seconds. Finding an old accident and scolding teaches nothing
- **Ignoring medical causes**: Sudden regression in a trained dog may indicate a UTI or other health issue — consult your vet

### Indoor vs. Outdoor Potty Training

Your living situation determines which approach works best:

**Outdoor training** is ideal for houses with yard access. The goal is always the same spot in the yard, praised immediately after elimination.

**Indoor solutions** (grass pads, pee pad holders, indoor dog toilets) are essential for apartment dwellers, elderly dogs, or during extreme weather. Modern grass pads with drainage trays are hygienic and simulate outdoor conditions.

**Hybrid approach**: Many trainers recommend starting with indoor pads and gradually transitioning to outdoor-only, especially for young puppies who can''t hold it through the night.

### What to Look for in Potty Training Products

When choosing potty training supplies, prioritize:

1. **Absorbency and leak-proofing** — cheap pads leak through, damaging floors
2. **Attractant sprays** — pheromone-based sprays that draw dogs to the correct spot
3. **Easy cleanup** — grass pads with removable trays, machine-washable options
4. **Size appropriate** — large dogs need large pads; small pads lead to near-misses
5. **Odor control** — activated charcoal layers or antimicrobial treatments

### US-Based Fulfillment for Time-Sensitive Training

Potty training is time-sensitive — every day without proper tools means more accidents, more frustration, and slower progress. All products in this collection ship from US fulfillment centers with 3–5 business day delivery. When your puppy needs training support now, we deliver.',
  faq = '[
    {"question": "How long does it take to potty train a dog?", "answer": "Most dogs achieve reliable housebreaking within 4-6 weeks with consistent training. Puppies under 6 months take longer because they physically cannot hold their bladder for extended periods. Adult dogs adopted from shelters may need 2-4 weeks to learn new household routines."},
    {"question": "Are grass pads better than pee pads for dogs?", "answer": "Grass pads are generally better for long-term use because they simulate outdoor conditions, making the transition to outdoor elimination easier. They also contain natural odor-controlling properties. Pee pads work well as temporary solutions but may confuse dogs about where it''s acceptable to eliminate indoors."},
    {"question": "Why does my potty-trained dog have accidents inside?", "answer": "Sudden regression in a trained dog can indicate a urinary tract infection, digestive issue, anxiety, or major routine change. Rule out medical causes with your vet first. Environmental triggers like new pets, moving, or schedule changes can also cause temporary setbacks."},
    {"question": "How often should I take my puppy outside to potty?", "answer": "Take your puppy out every 2-3 hours during the day, immediately after meals, after naps, and after play sessions. A general rule: puppies can hold their bladder for roughly one hour per month of age, up to about 8 hours maximum for adult dogs."},
    {"question": "Should I use potty training sprays?", "answer": "Attractant sprays can be helpful, especially for indoor training. They contain pheromones that encourage dogs to eliminate in the sprayed area. Place them on the pad or grass patch to establish the target location. They work best when combined with consistent scheduling and positive reinforcement."},
    {"question": "What is the best indoor potty solution for apartments?", "answer": "Real or synthetic grass pads with drainage trays are the most effective indoor solution. They''re hygienic, easy to clean, and help dogs transition to outdoor grass later. Look for pads with antimicrobial treatment and raised edges to prevent spillover. Size the pad appropriately for your dog''s breed."},
    {"question": "Can you potty train an older dog?", "answer": "Yes, adult dogs can absolutely be potty trained. In many cases, older dogs learn faster than puppies because they have better bladder control. Use the same positive reinforcement methods: consistent schedule, immediate praise for correct elimination, and enzymatic cleanup of any accidents."},
    {"question": "Is crate training necessary for potty training?", "answer": "Crate training is the most effective method for housebreaking because it leverages a dog''s natural instinct to keep their sleeping area clean. The crate should be just large enough to stand, turn, and lie down. Never use the crate as punishment, and never leave a puppy crated longer than they can physically hold it."}
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'dog-potty-training';

-- 3. Update dog-leash-control with long-form intro and enhanced meta
UPDATE public.seo_collections SET
  meta_title = 'Dog Leash Training Tools – Best No-Pull Solutions (2026)',
  meta_description = 'Shop professional leash training tools: no-pull harnesses, slip leads & control leashes. Stop pulling in days. Free US shipping $49+.',
  secondary_keywords = ARRAY['no pull dog harness', 'stop dog pulling on leash', 'leash training tools', 'dog walking control', 'front clip harness', 'slip lead training'],
  seo_intro = '## Why Your Dog Pulls on the Leash — And How to Fix It

Leash pulling isn''t defiance — it''s the most natural thing in the world for your dog. Dogs walk faster than humans, explore with their noses, and have never been taught that a tight leash means "slow down." Without proper training and equipment, every walk becomes a power struggle.

The good news: leash pulling is one of the most solvable behavioral issues in dog training. With the right tools and 2–3 weeks of consistent practice, most dogs can learn to walk calmly beside you.

### The Behavioral Psychology Behind Pulling

Dogs pull because **pulling works**. Every time your dog lunges forward and you follow, they learn that pulling = getting where they want to go. This is called "opposition reflex" — the harder you pull back, the harder your dog pushes forward.

Breaking this cycle requires two things:
1. **Equipment that prevents forward reward** (no-pull harnesses, head halters)
2. **Consistent training** that rewards loose-leash walking

### No-Pull Harness Types: Which One Works Best?

Not all harnesses are created equal. Understanding the different designs helps you choose the right tool for your dog:

**Front-clip harnesses** redirect your dog toward you when they pull. The leash attachment on the chest creates a turning motion that naturally discourages forward lunging. Best for moderate pullers and dogs new to harness training.

**Dual-clip harnesses** offer both front and back attachment points, giving you flexibility. Start with the front clip for training sessions, switch to the back clip for relaxed walks once your dog has learned loose-leash behavior.

**Head halters** fit over the dog''s muzzle and behind the ears, providing steering-wheel-like control. Most effective for strong pullers and reactive dogs, but require a desensitization period before your dog accepts wearing one.

**Slip leads** are a single rope that functions as both collar and leash. Used extensively by professional trainers and veterinarians. Provides gentle feedback without constant pressure.

### Common Leash Training Mistakes

Even with the right equipment, these errors can stall progress:

- **Starting with the wrong harness**: A back-clip harness actually encourages pulling by distributing force comfortably across the chest
- **Inconsistent reinforcement**: If pulling works sometimes (when you''re in a hurry), your dog learns to keep trying
- **Leash too long or too short**: A 4–6 foot leash is ideal for training. Retractable leashes teach dogs that pulling extends their range
- **Only training on walks**: Practice loose-leash walking in low-distraction environments first (backyard, quiet hallway) before testing on real walks
- **Skipping the fitting**: An ill-fitting harness chafes, shifts, or allows escape. Measure your dog''s chest girth accurately

### Choosing the Right Control Tools for Your Dog''s Size

Size and breed affect which leash control tools work best:

- **Small dogs (under 20 lbs)**: Lightweight step-in harnesses with soft padding. Avoid heavy-duty equipment that weighs them down
- **Medium dogs (20–60 lbs)**: Front-clip harnesses are ideal. Most medium dogs respond within 1–2 weeks of consistent training
- **Large dogs (60+ lbs)**: Dual-clip harnesses or head halters for initial training. Large breed pullers can generate dangerous force — proper equipment is a safety issue, not just convenience
- **Reactive dogs**: Head halters combined with a fixed-length leash provide maximum control in trigger situations

### US Fulfillment for Immediate Training Support

Leash pulling gets worse with each day of reinforced behavior. Every walk where pulling "works" makes the habit stronger. Our leash and control products ship from US warehouses with 3–5 business day delivery, so you can start correcting the behavior this week — not next month.',
  faq = '[
    {"question": "How do I stop my dog from pulling on the leash?", "answer": "Use a front-clip no-pull harness and practice the stop-and-redirect method: when your dog pulls, stop walking completely. Wait until the leash is loose, then continue. Reward your dog with treats when they walk beside you with a loose leash. Most dogs show improvement within 1-2 weeks of consistent practice."},
    {"question": "Are no-pull harnesses safe for dogs?", "answer": "Yes, properly fitted no-pull harnesses are safe and recommended by veterinarians and trainers. Front-clip harnesses redirect pulling force across the chest without putting pressure on the neck or throat. Always ensure the harness doesn''t restrict shoulder movement or chafe under the legs."},
    {"question": "What is better: a harness or a collar for walking?", "answer": "Harnesses are safer for most dogs, especially pullers, small breeds, and brachycephalic breeds (flat-faced dogs). Collars put pressure on the trachea and neck, which can cause injury in dogs that pull. Reserve flat collars for ID tags and use a harness for walking and training."},
    {"question": "How do I leash train a puppy?", "answer": "Start indoors by letting your puppy wear the leash and harness for short periods while playing. Practice walking in your home or yard with treats as motivation. Keep sessions under 10 minutes for young puppies. Gradually increase duration and add mild distractions as your puppy builds confidence."},
    {"question": "What length leash is best for training?", "answer": "A 4-6 foot fixed-length leash is ideal for everyday training. Shorter leashes restrict natural movement; longer leashes give too much freedom for training control. Avoid retractable leashes during training — they teach dogs that pulling extends their range."},
    {"question": "Do front-clip harnesses work for large dogs?", "answer": "Yes, front-clip harnesses are highly effective for large dogs. The chest attachment point creates a natural turning motion when the dog pulls, redirecting their momentum. For very strong pullers over 80 lbs, consider a dual-clip harness that offers both front and back attachment points."},
    {"question": "How long does leash training take?", "answer": "Most dogs show noticeable improvement within 2-3 weeks of daily practice with proper equipment. Full reliability typically takes 4-8 weeks depending on the dog''s age, breed, and how ingrained the pulling habit is. Puppies generally learn faster than adult dogs with established pulling habits."},
    {"question": "Why does my dog pull more on some walks?", "answer": "Dogs pull more in stimulating environments — new smells, other dogs, squirrels, or unfamiliar areas trigger excitement. Practice loose-leash walking in low-distraction settings first, then gradually add distractions. High-value treats can help redirect focus in exciting environments."}
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'dog-leash-control';

-- 4. Update dog-anti-bark with enhanced meta + more FAQs
UPDATE public.seo_collections SET
  meta_title = 'Anti-Bark Solutions – Humane Dog Bark Control (2026)',
  meta_description = 'Stop excessive barking with humane tools: ultrasonic deterrents, vibration collars & calming aids. Vet-approved, no-shock solutions. Free US shipping $49+.',
  secondary_keywords = ARRAY['stop dog barking', 'ultrasonic bark deterrent', 'humane bark control', 'anti bark collar no shock', 'dog barking solutions', 'separation anxiety barking'],
  faq = '[
    {"question": "Are ultrasonic bark deterrents effective?", "answer": "Yes — ultrasonic devices emit a high-frequency sound that interrupts the bark pattern. Studies show 70-80% effectiveness when paired with positive reinforcement. They work best for alert barking and attention-seeking barking, but may be less effective for anxiety-driven barking."},
    {"question": "Are anti-bark collars safe for dogs?", "answer": "Humane anti-bark collars using vibration, citronella spray, or ultrasonic sound are safe when used correctly. Avoid shock collars — they can cause fear, aggression, and increased anxiety. Look for collars with automatic shut-off features to prevent overstimulation."},
    {"question": "How long does it take to stop excessive barking?", "answer": "Most dogs show noticeable improvement within 2-3 weeks of consistent training with humane bark control tools. The timeline depends on the barking trigger: alert barking responds fastest, while anxiety-driven barking may take 4-6 weeks with combined behavioral and tool-based approaches."},
    {"question": "What causes dogs to bark excessively?", "answer": "Common causes include territorial alerting, separation anxiety, boredom, attention-seeking, fear responses, and medical pain. Identifying the root cause is essential — a dog barking from anxiety needs a different solution than a dog barking at the mailman."},
    {"question": "Do anti-bark devices work for all breeds?", "answer": "Most devices work across breeds, but effectiveness varies. Small breeds may respond better to ultrasonic devices, while larger breeds often need vibration collars. Breeds bred for guarding (German Shepherds, Rottweilers) may require more consistent training alongside any device."},
    {"question": "How do I stop my dog barking at night?", "answer": "Night barking is usually caused by anxiety, outdoor noises, or needing to go outside. Create a calm sleep environment, use white noise machines to mask outdoor triggers, and ensure your dog gets adequate exercise during the day. Anti-bark devices combined with a bedtime routine work well for most dogs."},
    {"question": "Are there alternatives to bark collars?", "answer": "Yes. Stationary ultrasonic devices, calming supplements, anxiety wraps (like ThunderShirts), puzzle toys for mental stimulation, and professional training are all effective alternatives. Many trainers recommend combining environmental management with positive reinforcement rather than relying solely on devices."},
    {"question": "Can excessive barking be a sign of a health problem?", "answer": "Yes. Sudden changes in barking behavior — especially increased barking, whining, or vocalizing — can indicate pain, cognitive decline in senior dogs, hearing loss, or other medical conditions. If your dog''s barking pattern changes suddenly, consult your veterinarian before trying behavioral interventions."}
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'dog-anti-bark';

-- 5. Update dog-training-accessories with enhanced meta + more FAQs
UPDATE public.seo_collections SET
  meta_title = 'Dog Training Accessories – Professional Tools & Gear (2026)',
  meta_description = 'Shop professional dog training accessories: clickers, treat pouches, long lines & agility gear. Trainer-recommended tools. Free US shipping $49+.',
  secondary_keywords = ARRAY['dog training clicker', 'treat pouch for training', 'dog training long line', 'agility training equipment', 'professional dog training gear', 'positive reinforcement tools'],
  faq = '[
    {"question": "What training accessories do I need for a new dog?", "answer": "Start with the basics: a clicker or marker word, a treat pouch that clips to your belt, high-value training treats, a 15-20 foot long line for recall practice, and a training target stick. These five tools cover all foundational obedience commands."},
    {"question": "Do dog training clickers really work?", "answer": "Yes. Clicker training is one of the most scientifically validated methods in animal behavior. The clicker provides a precise, consistent marker sound that tells your dog exactly which behavior earned the reward. Dogs trained with clickers learn new behaviors up to 50% faster than verbal-only methods."},
    {"question": "What treats are best for dog training?", "answer": "The best training treats are small (pea-sized), soft, smelly, and high-value — meaning your dog finds them more exciting than kibble. Freeze-dried liver, cheese cubes, and commercial training treats work well. Avoid hard biscuits that take too long to chew during training sessions."},
    {"question": "How do I use a long line for recall training?", "answer": "Attach a 15-30 foot long line to your dog''s harness (never a collar). Practice recall commands in a safe, enclosed area. Let your dog explore at the end of the line, then call them. The long line prevents your dog from self-rewarding by running away while you build reliable recall."},
    {"question": "What is the best age to start training a dog?", "answer": "Training should start the day you bring your dog home, regardless of age. Puppies as young as 8 weeks can learn basic commands through positive reinforcement. Older rescued dogs are equally trainable — they often learn faster because they have better focus and impulse control."},
    {"question": "Are agility training tools worth buying for home use?", "answer": "Home agility equipment is excellent for mental stimulation, physical exercise, and building confidence. Start with a tunnel, weave poles, and a low jump bar. Agility training strengthens the bond between you and your dog while providing a structured outlet for energy."},
    {"question": "How long should dog training sessions be?", "answer": "Keep training sessions short and productive: 5-10 minutes for puppies, 10-15 minutes for adult dogs, 2-3 times per day. Short frequent sessions are more effective than long infrequent ones. Always end on a success so your dog associates training with positive outcomes."},
    {"question": "What is the difference between positive reinforcement and punishment-based training?", "answer": "Positive reinforcement rewards desired behaviors (treats, praise, play), making them more likely to be repeated. Punishment-based methods try to stop unwanted behaviors through aversive consequences. Research consistently shows positive reinforcement produces faster, more reliable results with fewer behavioral side effects."}
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'dog-training-accessories';
