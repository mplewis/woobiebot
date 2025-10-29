/**
 * Returns a singular or plural form of a word based on a count.
 *
 * @param count - The number to determine singular or plural
 * @param singular - The singular form of the word
 * @param plural - The plural form of the word (defaults to singular + 's')
 * @returns The appropriate word form based on the count
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const pluralForm = plural ?? `${singular}s`;
  return count === 1 ? singular : pluralForm;
}
