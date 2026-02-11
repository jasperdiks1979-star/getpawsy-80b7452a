// Centralized author entity for E-E-A-T consistency across all content
export const AUTHOR = {
  name: 'Sarah Mitchell',
  jobTitle: 'Pet Product Researcher & Writer',
  url: 'https://getpawsy.pet/about-the-author',
  bio: 'Sarah has spent over 6 years researching and testing pet products for dogs and cats. She focuses on comfort, safety, and practical design — helping US pet parents make confident buying decisions.',
  shortBio: 'Pet product researcher with 6+ years of hands-on testing experience.',
  expertise: ['Cat Litter & Litter Boxes', 'Dog Beds & Crates', 'Pet Toys & Accessories', 'Grooming Supplies'],
  sameAs: [] as string[], // Add LinkedIn URL when available
};

export const PUBLISHER = {
  name: 'GetPawsy',
  url: 'https://getpawsy.pet',
  logo: 'https://getpawsy.pet/favicon.png',
  logoWidth: 512,
  logoHeight: 512,
};

export function getPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: AUTHOR.name,
    url: AUTHOR.url,
    jobTitle: AUTHOR.jobTitle,
    description: AUTHOR.bio,
    knowsAbout: AUTHOR.expertise,
    ...(AUTHOR.sameAs.length > 0 ? { sameAs: AUTHOR.sameAs } : {}),
    worksFor: {
      '@type': 'Organization',
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
  };
}

export function getPublisherSchema() {
  return {
    '@type': 'Organization',
    name: PUBLISHER.name,
    url: PUBLISHER.url,
    logo: {
      '@type': 'ImageObject',
      url: PUBLISHER.logo,
      width: PUBLISHER.logoWidth,
      height: PUBLISHER.logoHeight,
    },
  };
}

export function getAuthorSchema() {
  return {
    '@type': 'Person',
    name: AUTHOR.name,
    url: AUTHOR.url,
  };
}
