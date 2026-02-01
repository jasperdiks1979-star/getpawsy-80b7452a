/**
 * SEO Content Generation Prompts for GetPawsy
 * 
 * These prompts are designed to generate safe, Google-compliant content
 * that ranks for buyer-intent keywords and drives organic sales.
 * 
 * Usage: Import these prompts when generating new blog content via AI
 */

export const SEO_BLOG_PROMPT = `Write a helpful, experience-based blog article for US pet parents.

RULES:
1. Focus on ONE clear problem and ONE solution
2. Avoid generic advice - be specific and actionable
3. Use clear headings (H2, H3), short paragraphs, and practical tips
4. Naturally link to ONE relevant product collection (never force it)
5. Do NOT exaggerate or make medical claims
6. Write for trust and usefulness, not keyword stuffing
7. Use a friendly, conversational US English tone
8. Include 3-4 FAQs at the end

STRUCTURE:
- Title: "How to [solve problem] — A Complete Guide for Pet Parents"
- Intro (100-150 words): Describe the problem, why it matters, set expectations
- H2: Why This Problem Matters (150-200 words)
- H2: Common Mistakes Pet Parents Make (bulleted list, 5-7 items)
- H2: What to Look for When Choosing a Solution (200-250 words, with H3 subsections)
- H2: Recommended Products for Everyday Use (100-150 words, include ONE collection link)
- H2: Frequently Asked Questions (3-4 Q&As, 50-75 words each)

WORD COUNT: 1,500-2,000 words total
READING TIME: 7-9 minutes`;

export const SEO_COLLECTION_INTRO_PROMPT = `Write an SEO-optimized intro paragraph (150-200 words) for a product collection page.

RULES:
1. Clearly explain the problem pet parents have
2. Naturally include the primary keyword in the first sentence
3. Write for humans first, search engines second
4. Use a friendly, US-style tone
5. End with a value proposition (why shop here)
6. Do NOT use hyperbole or unsupported claims

OUTPUT FORMAT:
A single paragraph with no headings, suitable for the top of a collection page.`;

export const SEO_FAQ_PROMPT = `Generate 3-5 FAQ questions and answers for a product collection.

RULES:
1. Questions should be natural, conversational queries people actually search
2. Answers should be 40-80 words, informative but concise
3. Include the primary keyword naturally in at least one Q&A
4. Focus on buyer-intent questions (how to choose, why it matters, safety, usage)
5. Avoid medical claims or guarantees

OUTPUT FORMAT:
JSON array with objects containing "question" and "answer" fields.
Example: [{"question": "Why is X important?", "answer": "X helps because..."}]`;

export const SEO_META_DESCRIPTION_PROMPT = `Write a meta description (max 155 characters) for a product or collection page.

RULES:
1. Include the primary keyword naturally
2. Highlight the main benefit
3. Include a subtle CTA (shop now, discover, explore)
4. Mention free shipping if applicable
5. Do NOT exceed 155 characters

OUTPUT FORMAT:
A single line of text, no quotes.`;

export const SEO_META_TITLE_PROMPT = `Write an SEO meta title (max 60 characters) for a product or collection page.

RULES:
1. Primary keyword first
2. Include year (2025) for freshness
3. Brand name at the end (| GetPawsy)
4. Do NOT exceed 60 characters

OUTPUT FORMAT:
A single line of text, no quotes.
Example: "Dog Travel Accessories 2025 | Car Safety & Comfort | GetPawsy"`;

// Pre-defined content templates for common pet categories
export const CONTENT_TEMPLATES = {
  dog: {
    painPoints: [
      'messy eating and water spills',
      'anxiety during car rides',
      'destructive behavior when bored',
      'joint pain in older dogs',
      'difficulty training puppies',
      'shedding and grooming challenges',
    ],
    commonMistakes: [
      'Using the wrong size equipment',
      'Ignoring quality for lower prices',
      'Not considering the dog\'s breed-specific needs',
      'Skipping proper training integration',
      'Forgetting about durability and washability',
    ],
  },
  cat: {
    painPoints: [
      'boredom and lack of enrichment',
      'scratching furniture instead of posts',
      'litter box odors and mess',
      'hairballs and digestive issues',
      'stress during vet visits or travel',
      'difficulty maintaining hydration',
    ],
    commonMistakes: [
      'Assuming cats entertain themselves',
      'Placing litter boxes in wrong locations',
      'Not providing enough vertical space',
      'Using scented products that cats dislike',
      'Ignoring early signs of health issues',
    ],
  },
};

// Keyword density guidelines for safe SEO
export const SEO_GUIDELINES = {
  maxKeywordDensity: 0.02, // 2% maximum
  minWordCount: 1500,
  maxWordCount: 2500,
  minInternalLinks: 1,
  maxInternalLinks: 3,
  minFAQs: 3,
  maxFAQs: 5,
  targetReadingLevel: 8, // Grade level for readability
};
