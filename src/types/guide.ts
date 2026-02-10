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

export interface QuickRecommendation {
  bestOverall: { name: string; reason: string; link: string };
  bestBudget: { name: string; reason: string; link: string };
  bestPremium: { name: string; reason: string; link: string };
}

export interface ComparisonProduct {
  name: string;
  image?: string;
  price: string;
  advantages: string[];
  link: string;
  badge?: string;
}

export interface GuideData extends GuideMeta {
  sections: GuideSection[];
  faq: GuideFAQ[];
  buyingCriteria?: GuideBuyingCriteria;
  prosAndCons?: GuideProsAndCons;
  commonMistakes?: GuideCommonMistake[];
  quickRecommendation?: QuickRecommendation;
  comparisonProducts?: ComparisonProduct[];
}
