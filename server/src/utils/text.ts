/** Small, dependency-free text helpers shared by search + RAG. */

const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have he her him his how i if in into is it its me my of on or our show find get give tell what when where which who why will with you your about the this that these those document file pdf please search look want need using used use also than then there their them they was were we us`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.+#-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-_]+|[.\-_]+$/g, ''))
    .filter((t) => t.length > 1)
    .filter((t) => !STOPWORDS.has(t));
}

export function normaliseForEmbedding(text: string): string[] {
  const tokens = tokenize(text);
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
  return [...tokens, ...bigrams];
}

/** Simple stemming so "projects" matches "project", "files" matches "file". */
export function stem(token: string): string {
  return token
    .replace(/(ing|edly|ed|ies|es|s)$/i, (m) => (m === 'ies' ? 'y' : m === 's' && /ss$/i.test(token) ? m : ''))
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function clamp(text: string, max = 320): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(-half)}`;
}
