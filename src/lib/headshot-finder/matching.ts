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

// Common English nicknames (keyed on one form → alternates). Symmetric lookup
// is handled by `areNicknames` below.
const NICKNAMES: Record<string, string[]> = {
  michael: ["mike", "mick", "mikey"],
  robert: ["rob", "bob", "bobby", "robbie"],
  william: ["will", "bill", "billy", "willy", "liam"],
  james: ["jim", "jimmy", "jamie"],
  elizabeth: ["liz", "beth", "betty", "eliza", "lizzie", "libby"],
  christopher: ["chris", "topher"],
  katherine: ["kate", "kath", "kathy", "katie", "kat"],
  catherine: ["cate", "cathy", "kate", "cat"],
  matthew: ["matt", "matty"],
  nicholas: ["nick", "nicky", "nico"],
  daniel: ["dan", "danny"],
  anthony: ["tony", "ant"],
  richard: ["rick", "ricky", "dick", "richie"],
  joseph: ["joe", "joey"],
  samuel: ["sam", "sammy"],
  benjamin: ["ben", "benny", "benji"],
  jonathan: ["jon", "jonny", "jonah"],
  andrew: ["andy", "drew"],
  david: ["dave", "davey", "dave"],
  stephen: ["steve", "steph"],
  steven: ["steve", "stevie"],
  thomas: ["tom", "tommy", "tomo"],
  patricia: ["pat", "patti", "tricia", "trish"],
  patrick: ["pat", "paddy", "patty"],
  jessica: ["jess", "jessie"],
  jennifer: ["jen", "jenny", "jennie"],
  rebecca: ["bec", "becky", "becca"],
  alexander: ["alex", "al", "xander", "sasha"],
  alexandra: ["alex", "ali", "sandra", "sasha"],
  nathan: ["nate"],
  nathaniel: ["nathan", "nate"],
  cameron: ["cam"],
  gregory: ["greg", "gregg"],
  amanda: ["mandy", "amy"],
  angela: ["angie", "ang"],
  deborah: ["deb", "debbie", "debby"],
  margaret: ["maggie", "meg", "marg", "peggy", "maisie"],
  charles: ["charlie", "chas", "chuck"],
  edward: ["ed", "eddie", "ted", "teddy"],
  frederick: ["fred", "freddy", "freddie"],
  henry: ["hank", "harry", "hal"],
  harold: ["harry", "hal"],
  peter: ["pete", "petey"],
  ronald: ["ron", "ronnie"],
  terence: ["terry", "tez"],
  victoria: ["vicky", "vickie", "tori", "vic"],
  victor: ["vic"],
  gabriel: ["gabe", "gabby"],
  isabella: ["bella", "izzy", "izzie"],
  natalie: ["nat", "natty"],
  natalia: ["nat", "natty"],
  vanessa: ["ness", "nessa"],
  ashley: ["ash"],
  zachary: ["zach", "zack"],
  lawrence: ["larry", "lars"],
  laurence: ["laurie", "larry"],
  olivia: ["liv", "livvy"],
  madison: ["maddie", "maddy"],
  abigail: ["abby", "abi", "gail"],
  samantha: ["sam", "sammy"],
  melissa: ["mel", "missy"],
  melanie: ["mel", "mellie"],
  susan: ["sue", "susie", "suzie"],
  susanna: ["sue", "susie", "suzi"],
  cynthia: ["cindy", "cin"],
  nicole: ["nic", "nicki", "nicky"],
  stephanie: ["steph", "stevie", "fanny"],
  danielle: ["dani", "danny"],
  carolyn: ["carol", "caz"],
  joshua: ["josh"],
  dominic: ["dom", "dominick"],
  bernard: ["bernie", "bern"],
  raymond: ["ray"],
  francis: ["frank", "fran", "francie"],
  frances: ["fran", "fanny"],
  leonard: ["leo", "lenny", "len"],
  lawrence2: ["larry", "lars"],
  barbara: ["barb", "babs"],
  eleanor: ["ellie", "nora", "nell"],
  theresa: ["terry", "tess", "tess"],
  teresa: ["terry", "tess"],
  philip: ["phil"],
  phillip: ["phil"],
  bradley: ["brad"],
  jeffrey: ["jeff", "geoff"],
  geoffrey: ["geoff", "jeff"],
  kenneth: ["ken", "kenny"],
  ronald2: ["ron", "ronnie"],
  timothy: ["tim", "timmy"],
  douglas: ["doug"],
  kevin: ["kev"],
  lewis: ["lew"],
  louise: ["lou", "lulu"],
  louis: ["lou", "louie"],
  raymond2: ["ray", "raymo"],
  genevieve: ["gen", "gene", "ginny"],
  alfred: ["al", "alfie", "fred"],
  edwin: ["ed", "eddie"],
};

const NICKNAME_LOOKUP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const [canonical, aliases] of Object.entries(NICKNAMES)) {
    const c = canonical.replace(/\d+$/, "");
    for (const alias of aliases) {
      add(c, alias);
      add(alias, c);
      for (const other of aliases) {
        if (other !== alias) {
          add(alias, other);
          add(other, alias);
        }
      }
    }
  }
  return map;
})();

export function areNicknames(a: string, b: string): boolean {
  const set = NICKNAME_LOOKUP.get(a);
  return !!set && set.has(b);
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanScrapedName(raw: string): string {
  let name = raw.trim();
  const delimiters = [" - ", " — ", " – ", " | ", ","];
  for (const d of delimiters) {
    const idx = name.indexOf(d);
    if (idx > 0) name = name.slice(0, idx);
  }
  name = name.replace(
    /^(mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?|prof\.?|sir)\s+/i,
    "",
  );
  name = name.replace(
    /\s+(property manager|sales agent|agent|director|principal|licensee)$/i,
    "",
  );
  return name.trim();
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = normalise(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export function scoreNameMatch(
  scrapedName: string,
  pmFirst: string,
  pmLast: string,
): MatchResult | null {
  const cleaned = cleanScrapedName(scrapedName);
  const scraped = normalise(cleaned);
  const pmFull = normalise(`${pmFirst} ${pmLast}`);
  if (!scraped || !pmFull) return null;

  if (scraped === pmFull) return { confidence: "exact", score: 1 };

  const distance = levenshtein(scraped, pmFull);
  const maxLen = Math.max(scraped.length, pmFull.length);
  // Proportional threshold: allow up to 30% character difference, capped at 5
  const maxAllowed = Math.min(5, Math.max(3, Math.floor(maxLen * 0.3)));
  if (distance <= maxAllowed && maxLen > 0) {
    return {
      confidence: "fuzzy",
      score: Number(Math.max(0, 1 - distance / maxLen).toFixed(3)),
    };
  }

  const { first: scrapedFirst, last: scrapedLast } = splitName(cleaned);
  const pmFirstN = normalise(pmFirst);
  const pmLastN = normalise(pmLast);

  const lastsMatch =
    !!scrapedLast && !!pmLastN && scrapedLast === pmLastN;

  if (scrapedFirst && pmFirstN) {
    if (scrapedFirst === pmFirstN) {
      return {
        confidence: lastsMatch ? "fuzzy" : "uncertain",
        score: lastsMatch ? 0.7 : 0.5,
      };
    }
    if (areNicknames(scrapedFirst, pmFirstN)) {
      return {
        confidence: lastsMatch ? "fuzzy" : "uncertain",
        score: lastsMatch ? 0.65 : 0.55,
      };
    }
    // Fuzzy first name (abbreviations like "Jan" → "Janine")
    const firstDist = levenshtein(scrapedFirst, pmFirstN);
    const firstMax = Math.max(scrapedFirst.length, pmFirstN.length);
    if (
      firstMax >= 3 &&
      (firstDist <= 2 ||
        scrapedFirst.startsWith(pmFirstN) ||
        pmFirstN.startsWith(scrapedFirst))
    ) {
      return {
        confidence: lastsMatch ? "fuzzy" : "uncertain",
        score: lastsMatch ? 0.6 : 0.45,
      };
    }
  }

  return null;
}
