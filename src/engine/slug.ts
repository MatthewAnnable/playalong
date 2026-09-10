/**
 * The slug is derived from the song's title so the same practice link keeps
 * working unchanged once the hosted library is switched on (build plan 5.7).
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
