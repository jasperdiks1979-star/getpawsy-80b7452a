import { describe, it, expect } from 'vitest';
import { classifySpecies, filterProductsBySpecies } from './species-taxonomy';

describe('classifySpecies', () => {
  // === Dog-only products ===
  it('classifies "No Pull Dog Harness" as dog', () => {
    expect(classifySpecies('No Pull Dog Harness').speciesPrimary).toBe('dog');
  });
  it('classifies "Dog Training Leash for Pulling" as dog', () => {
    expect(classifySpecies('Dog Training Leash for Pulling').speciesPrimary).toBe('dog');
  });
  it('classifies "Puppy Potty Training Pad" as dog', () => {
    expect(classifySpecies('Puppy Potty Training Pad').speciesPrimary).toBe('dog');
  });
  it('classifies "Large Dog Orthopedic Bed" as dog', () => {
    expect(classifySpecies('Large Dog Orthopedic Bed').speciesPrimary).toBe('dog');
  });
  it('classifies "Anti Bark Training Collar" as dog', () => {
    expect(classifySpecies('Anti Bark Training Collar').speciesPrimary).toBe('dog');
  });

  // === Cat-only products ===
  it('classifies "Interactive Cat Toy" as cat', () => {
    expect(classifySpecies('Interactive Cat Toy').speciesPrimary).toBe('cat');
  });
  it('classifies "Cat Litter Box Furniture" as cat', () => {
    expect(classifySpecies('Cat Litter Box Furniture').speciesPrimary).toBe('cat');
  });
  it('classifies "Sisal Scratching Post" as cat', () => {
    expect(classifySpecies('Sisal Scratching Post').speciesPrimary).toBe('cat');
  });
  it('classifies "Catnip Mouse Toy" as cat', () => {
    expect(classifySpecies('Catnip Mouse Toy').speciesPrimary).toBe('cat');
  });
  it('classifies "Modern Cat Tree for Small Spaces" as cat', () => {
    expect(classifySpecies('Modern Cat Tree for Small Spaces').speciesPrimary).toBe('cat');
  });

  // === Multi-pet products ===
  it('classifies "Pet Bowl for Dogs and Cats" as multi', () => {
    expect(classifySpecies('Pet Bowl for Dogs and Cats').speciesPrimary).toBe('multi');
  });
  it('classifies "Dog & Cat Water Fountain" as multi', () => {
    expect(classifySpecies('Dog & Cat Water Fountain').speciesPrimary).toBe('multi');
  });
  it('classifies "Dog Cat Travel Carrier" as multi', () => {
    expect(classifySpecies('Dog Cat Travel Carrier').speciesPrimary).toBe('multi');
  });
  it('classifies "Automatic Feeder for Cats and Dogs" as multi', () => {
    expect(classifySpecies('Automatic Feeder for Cats and Dogs').speciesPrimary).toBe('multi');
  });

  // === Edge cases ===
  it('classifies "Premium Stainless Steel Bowl" as unknown (no species signals)', () => {
    expect(classifySpecies('Premium Stainless Steel Bowl').speciesPrimary).toBe('unknown');
  });
  it('classifies "Dog Potty Pad" as dog (not cat)', () => {
    const result = classifySpecies('Dog Potty Pad');
    expect(result.speciesPrimary).toBe('dog');
    expect(result.catScore).toBe(0);
  });
  it('classifies "Cat Condo with Scratching Post" as cat (not dog)', () => {
    const result = classifySpecies('Cat Condo with Scratching Post');
    expect(result.speciesPrimary).toBe('cat');
    expect(result.dogScore).toBe(0);
  });
  it('does NOT false-positive "catalog" as cat', () => {
    expect(classifySpecies('Product Catalog Listing').speciesPrimary).toBe('unknown');
  });
  it('respects category signals', () => {
    expect(classifySpecies('Premium Bed', 'Dog Beds').speciesPrimary).toBe('dog');
  });
  it('returns correct taxonomy version', () => {
    expect(classifySpecies('Dog Toy').taxonomyVersion).toBe(2);
  });

  // === Confidence + reasons ===
  it('returns high confidence for explicit multi-pet phrase', () => {
    const result = classifySpecies('Pet Bowl for Dogs and Cats');
    expect(result.speciesConfidence).toBeGreaterThanOrEqual(0.9);
    expect(result.speciesReasons).toContain('explicit_multi_pet_phrase');
  });
  it('returns reasons array with signal sources for dog', () => {
    const result = classifySpecies('Dog Training Leash');
    expect(result.speciesReasons.length).toBeGreaterThan(0);
    expect(result.speciesReasons.some(r => r.startsWith('title:'))).toBe(true);
  });
  it('returns zero confidence for unknown', () => {
    const result = classifySpecies('Premium Steel Item');
    expect(result.speciesConfidence).toBe(0);
    expect(result.speciesReasons).toContain('no_species_signals');
  });
  it('returns multi when both cat and dog signals present without explicit phrase', () => {
    const result = classifySpecies('Dog Harness with Cat Collar Adapter');
    expect(result.speciesPrimary).toBe('multi');
    expect(result.speciesReasons).toContain('both_species_signals_present');
  });
});

describe('filterProductsBySpecies', () => {
  const products = [
    { name: 'Dog Leash', category: 'Training', tags: [] },
    { name: 'Cat Tree', category: 'Furniture', tags: [] },
    { name: 'Pet Fountain for Dogs and Cats', category: null, tags: [] },
    { name: 'Stainless Bowl', category: null, tags: [] },
  ];

  it('filters dog products with multi-pet included', () => {
    const result = filterProductsBySpecies(products, 'dog', true);
    expect(result.length).toBe(2); // Dog Leash + Pet Fountain
    expect(result.map(p => p.name)).toContain('Dog Leash');
    expect(result.map(p => p.name)).toContain('Pet Fountain for Dogs and Cats');
  });

  it('filters dog products without multi-pet (strict mode, default)', () => {
    const result = filterProductsBySpecies(products, 'dog', false);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Dog Leash');
  });

  it('filters dog products without multi-pet using default param', () => {
    const result = filterProductsBySpecies(products, 'dog');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Dog Leash');
  });

  it('filters cat products with multi-pet included', () => {
    const result = filterProductsBySpecies(products, 'cat', true);
    expect(result.length).toBe(2); // Cat Tree + Pet Fountain
  });

  it('filters cat products without multi-pet', () => {
    const result = filterProductsBySpecies(products, 'cat', false);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Cat Tree');
  });
});
