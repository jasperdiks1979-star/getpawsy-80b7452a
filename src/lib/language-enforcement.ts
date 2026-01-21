/**
 * Language Enforcement Utility
 * 
 * Ensures all customer-facing text is in English and uses USD ($) currency.
 * Dutch text and Euro (€) symbols are automatically detected and flagged or replaced.
 */

// Common Dutch words that should never appear in customer-facing content
// Note: Short words (2-3 chars) that also exist in English are excluded to reduce false positives
const DUTCH_WORDS = new Set([
  // Articles & pronouns (excluding ones that match English like 'me', 'we', 'he')
  'het', 'een', 'deze', 'dit', 'die', 'dat', 'welke', 'elk', 'elke',
  'jij', 'hij', 'zij', 'wij', 'jullie', 'hen', 'hun',
  'mij', 'jou', 'hem', 'haar', 'ons', 'onze', 'uw',
  
  // Common verbs (excluding 'is', 'was', 'had' which are English)
  'zijn', 'ben', 'bent', 'waren', 'wordt', 'worden', 'werd', 'werden',
  'heeft', 'hebben', 'hadden', 'kan', 'kunnen', 'kon', 'konden',
  'moet', 'moeten', 'moest', 'moesten', 'mag', 'mogen', 'mocht', 'mochten',
  'wil', 'willen', 'wilde', 'wilden', 'zal', 'zullen', 'zou', 'zouden',
  'gaat', 'gaan', 'ging', 'gingen', 'komt', 'komen', 'kwam', 'kwamen',
  'staat', 'staan', 'stond', 'stonden', 'zit', 'zitten', 'zat', 'zaten',
  'ligt', 'liggen', 'lag', 'lagen', 'geeft', 'geven', 'gaf', 'gaven',
  'krijgt', 'krijgen', 'kreeg', 'kregen', 'ziet', 'zien', 'zag', 'zagen',
  'vraagt', 'vragen', 'vroeg', 'vroegen', 'denkt', 'denken', 'dacht', 'dachten',
  'weet', 'weten', 'wist', 'wisten', 'vindt', 'vinden', 'vond', 'vonden',
  'maakt', 'maken', 'maakte', 'maakten', 'neemt', 'nemen', 'nam', 'namen',
  'laat', 'laten', 'liet', 'lieten', 'blijft', 'blijven', 'bleef', 'bleven',
  'houdt', 'houden', 'hield', 'hielden', 'schrijft', 'schrijven', 'schreef', 'schreven',
  'leest', 'lezen', 'las', 'lazen', 'spreekt', 'spreken', 'sprak', 'spraken',
  
  // Common nouns
  'hond', 'honden', 'kat', 'katten', 'dier', 'dieren', 'huisdier', 'huisdieren',
  'product', 'producten', 'artikel', 'artikelen', 'prijs', 'prijzen',
  'kleur', 'kleuren', 'maat', 'maten', 'formaat', 'gewicht',
  'bestelling', 'bestellingen', 'order', 'orders', 'winkelwagen', 'winkelmandje',
  'verzending', 'levering', 'retour', 'retourneren', 'terugsturen',
  'betaling', 'betalen', 'korting', 'kortingscode', 'actie', 'aanbieding',
  'voorraad', 'beschikbaar', 'uitverkocht', 'nieuw', 'populair', 'bestseller',
  'dag', 'dagen', 'week', 'weken', 'maand', 'maanden', 'jaar', 'jaren',
  'vandaag', 'morgen', 'gisteren', 'nu', 'later', 'eerder', 'altijd', 'nooit',
  
  // Common adjectives
  'groot', 'grote', 'klein', 'kleine', 'goed', 'goede', 'mooi', 'mooie',
  'nieuw', 'nieuwe', 'oud', 'oude', 'snel', 'snelle', 'langzaam', 'langzame',
  'gratis', 'gratis verzending', 'inclusief', 'exclusief',
  
  // Common phrases (as single words that often appear)
  'welkom', 'bedankt', 'dankjewel', 'alstublieft', 'graag', 'helaas',
  'sorry', 'excuses', 'succesvol', 'mislukt', 'fout', 'probleem',
  'vraag', 'antwoord', 'hulp', 'ondersteuning', 'contact', 'informatie',
  'bekijk', 'bekijken', 'toevoegen', 'verwijderen', 'wijzigen', 'opslaan',
  'annuleren', 'bevestigen', 'akkoord', 'volgende', 'vorige', 'terug',
  'meer', 'minder', 'alle', 'geen', 'wel', 'niet',
  
  // UI-specific Dutch words
  'inloggen', 'uitloggen', 'registreren', 'aanmelden', 'afmelden',
  'wachtwoord', 'gebruikersnaam', 'emailadres', 'profiel', 'instellingen',
  'zoeken', 'filteren', 'sorteren', 'weergave',
  'winkelwagen', 'afrekenen', 'betalen', 'verzenden',
  
  // Admin words that shouldn't leak to frontend (excluding 'admin' and 'dashboard' which are English)
  'beheer', 'beheerder', 'overzicht',
  
  // Additional commonly used Dutch words
  'voeg', 'toe', 'aan', 'naar', 'voor', 'bij', 'uit', 'hallo', 'wereld',
  'ook', 'nog', 'dan', 'wel', 'niet', 'als', 'maar', 'dus', 'toch',
  'hier', 'daar', 'waar', 'wanneer', 'hoe', 'wat', 'wie', 'welk',
]);

// Dutch phrases that indicate Dutch text
const DUTCH_PHRASES = [
  'op voorraad',
  'niet op voorraad',
  'in winkelwagen',
  'naar winkelwagen',
  'gratis verzending',
  'binnen [0-9]+ dagen',
  'meer informatie',
  'lees meer',
  'bekijk details',
  'voeg toe',
  'ga naar',
  'terug naar',
  'klik hier',
  'ontdek meer',
  'bestel nu',
  'koop nu',
  'direct bestellen',
];

// Currency patterns to detect and replace
const EURO_PATTERNS = [
  /€\s*[\d,.]+/g,           // €10,00 or € 10.00
  /[\d,.]+\s*€/g,           // 10,00€ or 10.00 €
  /EUR\s*[\d,.]+/gi,        // EUR 10.00
  /[\d,.]+\s*EUR/gi,        // 10.00 EUR
  /\beur\b/gi,              // standalone EUR
];

export interface TextValidationResult {
  isValid: boolean;
  hasDutchWords: boolean;
  hasEuroSymbols: boolean;
  dutchWordsFound: string[];
  issues: string[];
}

/**
 * Validates text for Dutch words and Euro symbols
 */
export function validateText(text: string): TextValidationResult {
  if (!text || typeof text !== 'string') {
    return {
      isValid: true,
      hasDutchWords: false,
      hasEuroSymbols: false,
      dutchWordsFound: [],
      issues: [],
    };
  }

  const issues: string[] = [];
  const dutchWordsFound: string[] = [];
  
  // Check for Euro symbols
  const hasEuroSymbols = EURO_PATTERNS.some(pattern => pattern.test(text));
  if (hasEuroSymbols) {
    issues.push('Contains Euro (€) currency symbols - should use USD ($)');
  }
  
  // Check for Dutch words (case-insensitive, word boundaries)
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    // Clean the word of punctuation
    const cleanWord = word.replace(/[^a-zàáâãäåèéêëìíîïòóôõöùúûü]/gi, '');
    if (cleanWord.length >= 2 && DUTCH_WORDS.has(cleanWord)) {
      if (!dutchWordsFound.includes(cleanWord)) {
        dutchWordsFound.push(cleanWord);
      }
    }
  }
  
  const hasDutchWords = dutchWordsFound.length > 0;
  if (hasDutchWords) {
    issues.push(`Contains Dutch words: ${dutchWordsFound.join(', ')}`);
  }
  
  // Check for Dutch phrases
  for (const phrase of DUTCH_PHRASES) {
    const regex = new RegExp(phrase, 'gi');
    if (regex.test(text)) {
      issues.push(`Contains Dutch phrase: "${phrase}"`);
    }
  }
  
  return {
    isValid: !hasDutchWords && !hasEuroSymbols,
    hasDutchWords,
    hasEuroSymbols,
    dutchWordsFound,
    issues,
  };
}

/**
 * Formats a number as USD currency
 * Always uses $ symbol and US formatting (no Euro)
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats a number as USD currency without cents if whole number
 */
export function formatUSDCompact(amount: number): string {
  const isWholeNumber = amount % 1 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Removes Euro symbols and replaces with USD
 * This is a fallback for sanitizing external content
 */
export function sanitizeCurrency(text: string): string {
  if (!text) return text;
  
  // Replace € with $
  let sanitized = text.replace(/€/g, '$');
  
  // Replace EUR with USD
  sanitized = sanitized.replace(/\bEUR\b/gi, 'USD');
  
  // Fix European number formatting (1.000,00 -> 1,000.00)
  // This is a simple heuristic - may need refinement for edge cases
  sanitized = sanitized.replace(/(\d{1,3})\.(\d{3}),(\d{2})/g, '$1,$2.$3');
  
  return sanitized;
}

/**
 * Development-only: Logs a warning if Dutch text is detected
 * Does not throw in production to avoid breaking the app
 */
export function warnIfDutch(text: string, context?: string): void {
  if (process.env.NODE_ENV === 'development') {
    const result = validateText(text);
    if (!result.isValid) {
      console.warn(
        `🇳🇱 Dutch text detected${context ? ` in ${context}` : ''}:`,
        result.issues,
        `\nText: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`
      );
    }
  }
}

/**
 * Asserts text is English-only (for use in development/testing)
 */
export function assertEnglishOnly(text: string, context?: string): void {
  const result = validateText(text);
  if (!result.isValid) {
    throw new Error(
      `Non-English content detected${context ? ` in ${context}` : ''}: ${result.issues.join('; ')}`
    );
  }
}

// Export constants for testing
export const ENFORCEMENT_CONFIG = {
  DUTCH_WORDS,
  DUTCH_PHRASES,
  EURO_PATTERNS,
} as const;
