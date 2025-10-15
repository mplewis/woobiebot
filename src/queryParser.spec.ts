import { describe, expect, it } from "vitest";
import { parseQuery } from "./queryParser.js";

describe("basic parsing", () => {
  it("parses plain text without quotes as fuzzy term", () => {
    const result = parseQuery("dragon plushie");
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: ["dragon plushie"],
    });
  });

  it("parses single quoted phrase as exact match", () => {
    const result = parseQuery('"fire-breathing dragon"');
    expect(result).toEqual({
      exactPhrases: ["fire-breathing dragon"],
      fuzzyTerms: [],
    });
  });

  it("parses mixed quoted and unquoted terms", () => {
    const result = parseQuery('"fire-breathing" dragon plushie');
    expect(result).toEqual({
      exactPhrases: ["fire-breathing"],
      fuzzyTerms: ["dragon plushie"],
    });
  });

  it("parses multiple quoted phrases", () => {
    const result = parseQuery('"first phrase" middle "second phrase"');
    expect(result).toEqual({
      exactPhrases: ["first phrase", "second phrase"],
      fuzzyTerms: ["middle"],
    });
  });

  it("parses quoted phrases with unquoted terms before and after", () => {
    const result = parseQuery('before "exact match" after');
    expect(result).toEqual({
      exactPhrases: ["exact match"],
      fuzzyTerms: ["before", "after"],
    });
  });
});

describe("edge cases", () => {
  it("handles empty string", () => {
    const result = parseQuery("");
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: [],
    });
  });

  it("handles only whitespace", () => {
    const result = parseQuery("   ");
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: [],
    });
  });

  it("handles empty quotes", () => {
    const result = parseQuery('""');
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: [],
    });
  });

  it("handles empty quotes with surrounding text", () => {
    const result = parseQuery('before "" after');
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: ["before", "after"],
    });
  });

  it("handles unclosed quotes at end", () => {
    const result = parseQuery('before "unclosed quote');
    expect(result).toEqual({
      exactPhrases: ["unclosed quote"],
      fuzzyTerms: ["before"],
    });
  });

  it("handles only unclosed quotes", () => {
    const result = parseQuery('"unclosed');
    expect(result).toEqual({
      exactPhrases: ["unclosed"],
      fuzzyTerms: [],
    });
  });

  it("trims whitespace from phrases and terms", () => {
    const result = parseQuery('  before   "  exact  "  after  ');
    expect(result).toEqual({
      exactPhrases: ["exact"],
      fuzzyTerms: ["before", "after"],
    });
  });
});

describe("special characters", () => {
  it("handles file paths with slashes", () => {
    const result = parseQuery('"patterns/dragon.pdf"');
    expect(result).toEqual({
      exactPhrases: ["patterns/dragon.pdf"],
      fuzzyTerms: [],
    });
  });

  it("handles hyphens and underscores", () => {
    const result = parseQuery('"fire-breathing_dragon"');
    expect(result).toEqual({
      exactPhrases: ["fire-breathing_dragon"],
      fuzzyTerms: [],
    });
  });

  it("handles dots in filenames", () => {
    const result = parseQuery('"dragon.v2.final.pdf"');
    expect(result).toEqual({
      exactPhrases: ["dragon.v2.final.pdf"],
      fuzzyTerms: [],
    });
  });

  it("handles parentheses and brackets", () => {
    const result = parseQuery('"dragon (2024) [final]"');
    expect(result).toEqual({
      exactPhrases: ["dragon (2024) [final]"],
      fuzzyTerms: [],
    });
  });

  it("handles single quotes inside double quotes", () => {
    const result = parseQuery('"dragon\'s lair"');
    expect(result).toEqual({
      exactPhrases: ["dragon's lair"],
      fuzzyTerms: [],
    });
  });
});

describe("escaped characters", () => {
  it("handles escaped quotes within quoted phrase", () => {
    const result = parseQuery('"file \\"with\\" quotes"');
    expect(result).toEqual({
      exactPhrases: ['file "with" quotes'],
      fuzzyTerms: [],
    });
  });

  it("handles escaped backslash", () => {
    const result = parseQuery('"path\\\\to\\\\file"');
    expect(result).toEqual({
      exactPhrases: ["path\\to\\file"],
      fuzzyTerms: [],
    });
  });

  it("handles escaped quote in unquoted text", () => {
    const result = parseQuery('file\\"name');
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: ['file"name'],
    });
  });
});

describe("realistic search queries", () => {
  it("handles simple filename search", () => {
    const result = parseQuery('"dragon.pdf"');
    expect(result).toEqual({
      exactPhrases: ["dragon.pdf"],
      fuzzyTerms: [],
    });
  });

  it("handles path search", () => {
    const result = parseQuery('"patterns/amigurumi/dragon"');
    expect(result).toEqual({
      exactPhrases: ["patterns/amigurumi/dragon"],
      fuzzyTerms: [],
    });
  });

  it("handles mixed exact filename and fuzzy description", () => {
    const result = parseQuery('plushie "dragon.pdf" pattern');
    expect(result).toEqual({
      exactPhrases: ["dragon.pdf"],
      fuzzyTerms: ["plushie", "pattern"],
    });
  });

  it("handles exact subfolder with fuzzy filename", () => {
    const result = parseQuery('"patterns/accessories/" hat');
    expect(result).toEqual({
      exactPhrases: ["patterns/accessories/"],
      fuzzyTerms: ["hat"],
    });
  });

  it("handles version-specific filename", () => {
    const result = parseQuery('"dragon-v2.1-final"');
    expect(result).toEqual({
      exactPhrases: ["dragon-v2.1-final"],
      fuzzyTerms: [],
    });
  });
});

describe("multiple consecutive quotes", () => {
  it("handles adjacent quoted phrases", () => {
    const result = parseQuery('"first""second"');
    expect(result).toEqual({
      exactPhrases: ["first", "second"],
      fuzzyTerms: [],
    });
  });

  it("handles four consecutive quotes (two empty pairs)", () => {
    const result = parseQuery('""""');
    expect(result).toEqual({
      exactPhrases: [],
      fuzzyTerms: [],
    });
  });

  it("handles quoted phrase followed by space and another quoted phrase", () => {
    const result = parseQuery('"first" "second"');
    expect(result).toEqual({
      exactPhrases: ["first", "second"],
      fuzzyTerms: [],
    });
  });
});
