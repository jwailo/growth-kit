export const FRANCHISE_PATTERNS: Record<string, string[]> = {
  "Ray White": ["/team", "/our-team"],
  "LJ Hooker": ["/team", "/our-team"],
  "Belle Property": ["/agents", "/team"],
  "McGrath": ["/agents", "/team"],
  "Harcourts": ["/team", "/our-team"],
  "Stone Real Estate": ["/team", "/agents"],
  "PRD": ["/team", "/our-team"],
};

export function getFranchisePaths(agencyName: string): string[] | null {
  const lower = agencyName.toLowerCase();
  for (const [franchise, paths] of Object.entries(FRANCHISE_PATTERNS)) {
    if (lower.startsWith(franchise.toLowerCase())) {
      return paths;
    }
  }
  return null;
}
