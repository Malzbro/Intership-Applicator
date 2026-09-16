export type PlacementType =
  | "summer"
  | "industrial_year"
  | "graduate_scheme"
  | "apprenticeship"
  | "internship_other";

export const PLACEMENT_TYPE_LABELS: Record<PlacementType, string> = {
  summer: "Summer internship",
  industrial_year: "Year-long placement",
  graduate_scheme: "Graduate scheme",
  apprenticeship: "Apprenticeship",
  internship_other: "Internship (unspecified)",
};

// Order matters: a "Summer Placement 2027" is a summer internship, not a
// year-long placement, so the season signal is tested before the duration one.
const RULES: [PlacementType, RegExp][] = [
  ["apprenticeship", /\bapprentice(ship)?\b|degree apprentice/i],
  [
    "summer",
    /\bsummer\b|vacation scheme|\b(6|8|9|10|11|12)[\s-]?week|\bjune[\s-]*(to|–|-)[\s-]*(august|september)\b|\bspring\/summer\b/i,
  ],
  [
    "industrial_year",
    /industrial placement|year in industry|placement year|sandwich (year|course|placement)|\b(6|9|10|11|12|13|14)[\s-]?month\b|\b1[\s-]?year placement\b|\byear[\s-]?long\b/i,
  ],
  ["graduate_scheme", /graduate (scheme|programme|program)|\bgrad scheme\b/i],
  ["internship_other", /\bintern(ship)?\b|\bplacement\b|\bundergraduate\b|\bstudent\b/i],
];

// In a description the generic words are unreliable: agencies call every job
// a "placement", and "student" turns up in benefits blurbs. There, only an
// explicit internship phrase counts as an unspecified internship.
const BODY_RULES: [PlacementType, RegExp][] = RULES.map(([type, re]) =>
  type === "internship_other"
    ? [type, /\binternship\b|\bintern programme\b|\bundergraduate (placement|internship)\b|\bstudent placement\b/i]
    : [type, re]
);

export function classifyPlacement(
  title: string,
  description?: string | null
): PlacementType | null {
  // the title is authoritative; the description is a weaker fallback
  for (const [type, re] of RULES) if (re.test(title)) return type;
  const body = (description ?? "").slice(0, 4000);
  for (const [type, re] of BODY_RULES) if (re.test(body)) return type;
  return null;
}

const AGENCY_NAME =
  /\brecruit(ment|ing|er|ers)?\b|\bresourcing\b|\bstaffing\b|\btalent\b|\bpersonnel\b|\bsearch (&|and) selection\b|\bagency\b|\bconsultants?\b|\bmanpower\b|\bemployment services\b/i;

const AGENCY_SUMMARY =
  /\b(recruitment|staffing|resourcing|employment) (agency|consultancy|business|specialists?|partner)\b|\bwe (place|recruit) candidates\b|\bjob board\b/i;

// Agency-posted roles are real jobs, but the agency's own pages tell you
// nothing about the employer you are writing to — so they rank lower.
export function looksLikeAgency(name: string, summary?: string | null): boolean {
  if (AGENCY_NAME.test(name)) return true;
  return summary ? AGENCY_SUMMARY.test(summary) : false;
}
