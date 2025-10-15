/**
 * Represents a parsed search query with quoted and unquoted terms.
 */
export interface ParsedQuery {
  /** Exact phrases that must match literally (from quoted strings) */
  exactPhrases: string[];
  /** Terms for fuzzy matching (unquoted) */
  fuzzyTerms: string[];
}

/**
 * Parse a search query to extract quoted phrases and unquoted terms.
 * Quoted phrases will be used for exact matching, while unquoted terms
 * will be used for fuzzy search.
 *
 * @param query - The raw search query string
 * @returns Parsed query with exact phrases and fuzzy terms
 *
 * @example
 * parseQuery('dragon plushie') // { exactPhrases: [], fuzzyTerms: ['dragon plushie'] }
 * parseQuery('"fire-breathing" dragon') // { exactPhrases: ['fire-breathing'], fuzzyTerms: ['dragon'] }
 * parseQuery('"patterns/dragon.pdf"') // { exactPhrases: ['patterns/dragon.pdf'], fuzzyTerms: [] }
 */
export function parseQuery(query: string): ParsedQuery {
  const exactPhrases: string[] = [];
  const fuzzyTerms: string[] = [];

  let current = "";
  let inQuotes = false;
  let escaped = false;

  for (const char of query) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      if (inQuotes) {
        const phrase = current.trim();
        if (phrase.length > 0) {
          exactPhrases.push(phrase);
        }
        current = "";
        inQuotes = false;
      } else {
        const term = current.trim();
        if (term.length > 0) {
          fuzzyTerms.push(term);
        }
        current = "";
        inQuotes = true;
      }
      continue;
    }

    current += char;
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    if (inQuotes) {
      exactPhrases.push(remaining);
    } else {
      fuzzyTerms.push(remaining);
    }
  }

  return { exactPhrases, fuzzyTerms };
}
