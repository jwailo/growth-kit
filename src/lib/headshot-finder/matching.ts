export type MatchConfidence = "exact" | "fuzzy" | "uncertain";

export type MatchResult = {
  confidence: MatchConfidence;
  score: number;
};

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = norm(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export function scoreNameMatch(
  scrapedName: string,
  pmFirst: string,
  pmLast: string,
): MatchResult | null {
  const scraped = norm(scrapedName);
  const pmFull = norm(`${pmFirst} ${pmLast}`);
  if (!scraped || !pmFull) return null;

  if (scraped === pmFull) return { confidence: "exact", score: 1 };

  const distance = levenshtein(scraped, pmFull);
  const maxLen = Math.max(scraped.length, pmFull.length);
  if (distance <= 3 && maxLen > 0) {
    return {
      confidence: "fuzzy",
      score: Number(Math.max(0, 1 - distance / maxLen).toFixed(3)),
    };
  }

  const scrapedFirst = splitName(scrapedName).first;
  const pmFirstNorm = norm(pmFirst);
  if (scrapedFirst && pmFirstNorm && scrapedFirst === pmFirstNorm) {
    return { confidence: "uncertain", score: 0.5 };
  }

  return null;
}
