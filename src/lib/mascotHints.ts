/** Context hints for the kitten shopping helper. Links only to existing collections/guides; no product claims. */
export interface MascotHint { text: string; links: { label: string; to: string }[] }

const COLL = {
  cats: '/collections/cats', dogs: '/collections/dogs', litter: '/collections/cat-litter-boxes',
  catToys: '/collections/cat-toys', trees: '/collections/cat-trees-and-condos', dogBeds: '/collections/dog-beds',
};

export function mascotHint(ctx: { slug?: string | null; name?: string | null; species?: string | null }): MascotHint {
  const s = `${ctx.slug ?? ''} ${ctx.name ?? ''}`.toLowerCase();
  if (/litter/.test(s)) return { text: 'Need help choosing a litter box?', links: [{ label: 'All litter boxes', to: COLL.litter }, { label: 'Litter box guide', to: '/guides/best-cat-litter-box-2026' }] };
  if (/tree|condo|tower|perch/.test(s)) return { text: 'Comparing cat trees? Check height and base size against your space.', links: [{ label: 'All cat trees', to: COLL.trees }, { label: 'Cat guides', to: '/guides' }] };
  if (/dog.*bed|bed.*dog|dog-beds/.test(s)) return { text: 'Picking a dog bed? Measure your dog nose-to-tail first.', links: [{ label: 'All dog beds', to: COLL.dogBeds }, { label: 'Shop for dogs', to: COLL.dogs }] };
  if (/toy|teaser|ball/.test(s) && /cat/.test(s)) return { text: 'Looking for play ideas?', links: [{ label: 'All cat toys', to: COLL.catToys }, { label: 'Laser toy guide', to: '/guides/laser-toys-for-cats' }] };
  if (ctx.species === 'dog' || /\bdogs?\b/.test(s)) return { text: 'Shopping for your dog?', links: [{ label: 'Shop for dogs', to: COLL.dogs }, { label: 'Dog beds', to: COLL.dogBeds }] };
  if (ctx.species === 'cat' || /\bcats?\b/.test(s)) return { text: 'Shopping for your cat?', links: [{ label: 'Shop for cats', to: COLL.cats }, { label: 'Cat trees', to: COLL.trees }] };
  return { text: 'Not sure where to start?', links: [{ label: 'Shop for cats', to: COLL.cats }, { label: 'Shop for dogs', to: COLL.dogs }, { label: 'Product finder', to: '/' }] };
}

export const HINTS_OFF_KEY = 'gp_mascot_hints_off';
