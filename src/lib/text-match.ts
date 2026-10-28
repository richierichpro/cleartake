// Matching phrases against spoken words. Pure, so the browser and the server share it.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

/** First time the phrase is spoken inside [from, to) words (tolerates one mismatched word in 4). */
export function findPhraseTime(words: { text: string; start: number }[], phrase: string, from = 0, to = words.length) {
  const p = tokens(phrase);
  if (!p.length) return null;
  const w = words.map((x) => norm(x.text));
  for (let i = from; i + p.length <= to; i++) {
    let hits = 0;
    for (let k = 0; k < p.length; k++) if (w[i + k] === p[k]) hits++;
    if (w[i] === p[0] && hits / p.length >= 0.75) return words[i].start;
  }
  return null;
}
