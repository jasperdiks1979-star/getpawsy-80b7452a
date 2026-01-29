import { Helmet } from 'react-helmet-async';

interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

interface HowToSchemaProps {
  howTo: {
    name: string;
    description: string;
    image?: string;
    totalTime?: string; // ISO 8601 duration, e.g., "PT30M"
    estimatedCost?: {
      currency: string;
      value: string;
    };
    supply?: string[]; // Materials needed
    tool?: string[]; // Tools needed
    steps: HowToStep[];
  };
  pageUrl?: string;
  baseUrl?: string;
}

export function HowToSchema({ 
  howTo, 
  pageUrl,
  baseUrl = 'https://getpawsy.pet' 
}: HowToSchemaProps) {
  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.name,
    description: howTo.description,
    ...(howTo.image && { image: howTo.image }),
    ...(howTo.totalTime && { totalTime: howTo.totalTime }),
    ...(howTo.estimatedCost && {
      estimatedCost: {
        '@type': 'MonetaryAmount',
        currency: howTo.estimatedCost.currency,
        value: howTo.estimatedCost.value,
      },
    }),
    ...(howTo.supply && howTo.supply.length > 0 && {
      supply: howTo.supply.map((item) => ({
        '@type': 'HowToSupply',
        name: item,
      })),
    }),
    ...(howTo.tool && howTo.tool.length > 0 && {
      tool: howTo.tool.map((item) => ({
        '@type': 'HowToTool',
        name: item,
      })),
    }),
    step: howTo.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url }),
    })),
    ...(pageUrl && { url: pageUrl }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(howToSchema)}
      </script>
    </Helmet>
  );
}

// Pre-built How-To guides for common pet care topics
export const PET_CARE_HOW_TOS = {
  assembleCatTree: {
    name: 'How to Assemble a Cat Tree',
    description: 'Step-by-step guide to assembling your new cat tree safely and securely.',
    totalTime: 'PT45M',
    tool: ['Screwdriver', 'Allen wrench (usually included)'],
    steps: [
      {
        name: 'Unpack all components',
        text: 'Carefully unpack all parts and lay them out. Check against the parts list to ensure nothing is missing.',
      },
      {
        name: 'Identify the base',
        text: 'Find the largest, heaviest platform - this is your base. Place it on a flat surface.',
      },
      {
        name: 'Attach the first posts',
        text: 'Screw the sisal-wrapped posts into the base platform. Tighten securely.',
      },
      {
        name: 'Add platforms level by level',
        text: 'Work from bottom to top, attaching each platform and securing with bolts.',
      },
      {
        name: 'Attach accessories',
        text: 'Add any hanging toys, hammocks, or condos according to the instructions.',
      },
      {
        name: 'Test stability',
        text: 'Gently shake the assembled tree to ensure it\'s stable. Place against a wall for extra security if needed.',
      },
    ],
  },
  trainPuppyBasics: {
    name: 'How to Train a Puppy: Basic Commands',
    description: 'Learn the essential techniques for teaching your puppy sit, stay, and come.',
    totalTime: 'PT20M',
    supply: ['Training treats', 'Clicker (optional)'],
    steps: [
      {
        name: 'Get your puppy\'s attention',
        text: 'Hold a treat near your puppy\'s nose to get their focus. Move to a quiet area with minimal distractions.',
      },
      {
        name: 'Teach "Sit"',
        text: 'Hold the treat above your puppy\'s head and slowly move it backward. Their bottom will naturally lower. Say "sit" as they do, then reward immediately.',
      },
      {
        name: 'Practice "Stay"',
        text: 'Once sitting, hold your palm out and say "stay." Take one step back. If they stay, reward. Gradually increase distance.',
      },
      {
        name: 'Teach "Come"',
        text: 'With your puppy on a long leash, crouch down and call "come" enthusiastically. Reward when they reach you.',
      },
      {
        name: 'Keep sessions short',
        text: 'Puppies have short attention spans. Keep training sessions to 5-10 minutes and always end on a positive note.',
      },
    ],
  },
  cleanSlowFeeder: {
    name: 'How to Clean a Slow Feeder Bowl',
    description: 'Proper cleaning instructions to keep your pet\'s slow feeder hygienic and safe.',
    totalTime: 'PT10M',
    supply: ['Dish soap', 'Warm water', 'Soft brush or sponge'],
    steps: [
      {
        name: 'Rinse immediately after use',
        text: 'Remove leftover food and rinse with warm water as soon as your pet finishes eating.',
      },
      {
        name: 'Apply dish soap',
        text: 'Add a small amount of pet-safe dish soap to the bowl.',
      },
      {
        name: 'Scrub all ridges',
        text: 'Use a soft brush to reach into all the maze patterns and ridges where food can hide.',
      },
      {
        name: 'Rinse thoroughly',
        text: 'Rinse with clean water until all soap residue is removed.',
      },
      {
        name: 'Dry completely',
        text: 'Allow to air dry or dry with a clean towel before storing or refilling.',
      },
    ],
  },
};
