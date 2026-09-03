// Centralized author entity for E-E-A-T consistency across all content
export const AUTHOR = {
  name: 'GetPawsy Editorial',
  jobTitle: 'Editorial team',
  url: 'https://getpawsy.pet/about-the-author',
  bio: 'The GetPawsy editorial team writes our buying guides based on published manufacturer specifications, materials documentation and price comparison. We do not perform our own laboratory or in-home product testing.',
  shortBio: 'Buying guides based on published specifications and price comparison.',
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
    '@type': 'Organization',
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
    '@type': 'Organization',
    name: AUTHOR.name,
    url: AUTHOR.url,
  };
}
