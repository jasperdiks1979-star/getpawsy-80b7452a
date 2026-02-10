export interface GuideFAQ {
  question: string;
  answer: string;
}

export interface GuideSection {
  heading: string;
  content: string;
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

export interface GuideData extends GuideMeta {
  sections: GuideSection[];
  faq: GuideFAQ[];
}
