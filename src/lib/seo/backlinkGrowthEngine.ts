/**
 * Backlink Growth Engine
 * 
 * Generates social amplification and backlink assets for published guides.
 * Produces Pinterest, Reddit, Medium, and outreach templates.
 */

import backlinkTargets from '@/data/backlinkTargets.json';

const BASE_URL = 'https://getpawsy.pet';

// ============= TYPES =============

export interface GuideInput {
  title: string;
  slug: string;
  keywords: string[];
  summary: string;
  category?: string;
}

export interface PinterestAsset {
  title: string;
  description: string;
  pinText: string;
  pinUrl: string;
  imagePrompt: string;
  suggestedBoards: string[];
}

export interface RedditAsset {
  postTitle: string;
  postBody: string;
  guideUrl: string;
  suggestedSubreddits: string[];
}

export interface MediumAsset {
  headline: string;
  intro: string;
  bodySections: string[];
  attributionLink: string;
  callToAction: string;
}

export interface OutreachAsset {
  subject: string;
  body: string;
  guideUrl: string;
}

export interface BacklinkAssets {
  pinterest: PinterestAsset;
  reddit: RedditAsset;
  medium: MediumAsset;
  outreach: OutreachAsset;
  generatedAt: string;
}

// ============= CATEGORY DETECTION =============

function detectAnimal(keywords: string[], category?: string): 'cat' | 'dog' | 'general' {
  const text = [...keywords, category || ''].join(' ').toLowerCase();
  const catSignals = (text.match(/cat|kitten|feline|litter|scratching/g) || []).length;
  const dogSignals = (text.match(/dog|puppy|canine|grooming|training/g) || []).length;
  if (catSignals > dogSignals) return 'cat';
  if (dogSignals > catSignals) return 'dog';
  return 'general';
}

// ============= PINTEREST =============

function generatePinterestAsset(guide: GuideInput): PinterestAsset {
  const animal = detectAnimal(guide.keywords, guide.category);
  const year = new Date().getFullYear();
  const boards = backlinkTargets.pinterest
    .filter(b => b.category === animal || b.category === 'general')
    .map(b => b.board);

  return {
    title: `${guide.title} (${year} Guide)`,
    description: guide.summary.slice(0, 500),
    pinText: `${guide.summary.slice(0, 200)}… Read the full guide at GetPawsy.`,
    pinUrl: `${BASE_URL}/guides/${guide.slug}`,
    imagePrompt: `Clean infographic for "${guide.title}". Show key tips as numbered list with cute ${animal === 'general' ? 'pet' : animal} illustrations. Soft pastel colors, modern flat design, Pinterest-optimized vertical 1000x1500 format.`,
    suggestedBoards: boards.slice(0, 4),
  };
}

// ============= REDDIT =============

function generateRedditAsset(guide: GuideInput): RedditAsset {
  const animal = detectAnimal(guide.keywords, guide.category);
  const subreddits = backlinkTargets.reddit
    .filter(r => r.category === animal || r.category === 'general')
    .map(r => r.name);

  const topKeywords = guide.keywords.slice(0, 3).join(', ');

  return {
    postTitle: `${guide.title} – Complete Guide`,
    postBody: `Hey everyone! I recently put together a comprehensive guide on **${topKeywords}** that I thought might be helpful.

${guide.summary}

I cover what to look for, common mistakes, and specific product recommendations based on real testing.

**Full guide here:** ${BASE_URL}/guides/${guide.slug}

Happy to answer any questions! 🐾`,
    guideUrl: `${BASE_URL}/guides/${guide.slug}`,
    suggestedSubreddits: subreddits.slice(0, 5),
  };
}

// ============= MEDIUM =============

function generateMediumAsset(guide: GuideInput): MediumAsset {
  const keywordList = guide.keywords.slice(0, 5).join(', ');

  return {
    headline: guide.title,
    intro: `If you've been searching for ${keywordList}, you're not alone. Thousands of pet parents face this same challenge every day. In this guide, we break down everything you need to know.`,
    bodySections: [
      `## Why ${guide.keywords[0] || 'This Topic'} Matters\n\n${guide.summary}`,
      `## What We Found\n\nAfter researching and testing multiple options, we identified key factors that make a real difference for pet owners. The full breakdown — including specific product recommendations and buying criteria — is in our detailed guide.`,
      `## Key Takeaways\n\n- Focus on quality and durability over price alone\n- Consider your pet's specific needs and preferences\n- Read detailed reviews before committing to a purchase\n- Check for safety certifications and materials`,
    ],
    attributionLink: `*Originally published at [GetPawsy](${BASE_URL}/guides/${guide.slug})*`,
    callToAction: `**[Read the full guide with product recommendations →](${BASE_URL}/guides/${guide.slug})**`,
  };
}

// ============= OUTREACH =============

function generateOutreachAsset(guide: GuideInput): OutreachAsset {
  const topic = guide.keywords[0] || guide.title.toLowerCase();

  return {
    subject: `Pet Care Guide Collaboration – ${guide.title}`,
    body: `Hello,

I recently published a comprehensive guide about ${topic} that I thought might be valuable for your readers.

The guide covers practical advice, product comparisons, and common mistakes pet parents make — all based on hands-on testing.

If you're interested, feel free to reference it in your content:
${BASE_URL}/guides/${guide.slug}

I'd also be happy to collaborate on a guest post or provide additional expert insights for your audience.

Best regards,
The GetPawsy Team
https://getpawsy.pet`,
    guideUrl: `${BASE_URL}/guides/${guide.slug}`,
  };
}

// ============= MAIN GENERATOR =============

export function generateBacklinkAssets(guide: GuideInput): BacklinkAssets {
  return {
    pinterest: generatePinterestAsset(guide),
    reddit: generateRedditAsset(guide),
    medium: generateMediumAsset(guide),
    outreach: generateOutreachAsset(guide),
    generatedAt: new Date().toISOString(),
  };
}

// ============= BATCH STATS =============

export function getBacklinkTargetStats() {
  return {
    redditCommunities: backlinkTargets.reddit.length,
    pinterestBoards: backlinkTargets.pinterest.length,
    mediumPublications: backlinkTargets.medium.length,
    outreachTypes: backlinkTargets.outreach.length,
    totalTargets:
      backlinkTargets.reddit.length +
      backlinkTargets.pinterest.length +
      backlinkTargets.medium.length +
      backlinkTargets.outreach.length,
  };
}
