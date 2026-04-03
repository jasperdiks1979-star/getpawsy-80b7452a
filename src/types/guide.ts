export interface GuideFAQ {
  question: string;
  answer: string;
}

export interface GuideSection {
  heading: string;
  content: string;
}

export interface GuideBuyingCriterion {
  name: string;
  description: string;
}

export interface GuideBuyingCriteria {
  title?: string;
  criteria: GuideBuyingCriterion[];
}

export interface GuideProsAndCons {
  pros: string[];
  cons: string[];
}

export interface GuideCommonMistake {
  mistake: string;
  whyItMatters: string;
}

export interface GuideMeta {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  featuredImage: string;
  readingTime: number;
  relatedCategories: string[];
}

export interface QuickRecommendationPick {
  name: string;
  reason: string;
  link: string;
  image?: string;
}

export interface QuickRecommendation {
  bestOverall: QuickRecommendationPick;
  bestBudget: QuickRecommendationPick;
  bestPremium: QuickRecommendationPick;
}

export interface ComparisonProduct {
  name: string;
  image?: string;
  price: string;
  advantages: string[];
  link: string;
  badge?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  description?: string;
  sku?: string;
}

export interface GuideHowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

export interface GuideHowTo {
  name: string;
  description: string;
  totalTime?: string;
  estimatedCost?: { currency: string; value: string };
  supply?: string[];
  tool?: string[];
  steps: GuideHowToStep[];
}

export interface GuideDifficultyItem {
  game: string;
  energy: 'High' | 'Medium' | 'Low';
  difficulty: 'Easy' | 'Medium' | 'Advanced';
  bestFor: string;
  type: 'Outdoor' | 'Both' | 'Indoor';
}

export interface GuideData extends GuideMeta {
  sections: GuideSection[];
  faq: GuideFAQ[];
  buyingCriteria?: GuideBuyingCriteria;
  prosAndCons?: GuideProsAndCons;
  commonMistakes?: GuideCommonMistake[];
  quickRecommendation?: QuickRecommendation;
  comparisonProducts?: ComparisonProduct[];
  quickAnswer?: string;
  whoThisIsFor?: string[];
  jumpNav?: { label: string; anchor: string }[];
  seoTitle?: string;
  seoDescription?: string;
  h1Override?: string;
  trustLines?: string[];
  howTo?: GuideHowTo;
  suggestedImageAlts?: string[];
  featuredSnippet?: string;
  difficultyOverview?: GuideDifficultyItem[];
  bulletSummary?: string[];
  notFor?: string[];
}
