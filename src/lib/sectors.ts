// Client-safe sector definitions. The model-backed classifier lives in
// sectorClassifier.ts, which must stay out of browser bundles.

export type Sector =
  | "engineering"
  | "technology"
  | "finance_tech"
  | "infrastructure"
  | "installer_services"
  | "recruitment_agency"
  | "other";

export const SECTOR_LABELS: Record<Sector, string> = {
  engineering: "Engineering",
  technology: "Tech & AI",
  finance_tech: "Finance tech",
  infrastructure: "Infrastructure & utilities",
  installer_services: "Installation & services",
  recruitment_agency: "Recruitment agency",
  other: "Other",
};

export const SECTOR_DESCRIPTIONS: Record<Sector, string> = {
  engineering: "Design or build engineered products — aerospace, defence, automotive, semiconductors, robotics, energy tech",
  technology: "Software, AI and computing hardware",
  finance_tech: "Banks, trading firms and exchanges hiring engineers",
  infrastructure: "Civil and built-environment consultancies, construction, grid and utilities",
  installer_services: "Installation, maintenance, facilities and electrical contracting, training providers",
  recruitment_agency: "Agencies advertising on behalf of an unnamed employer",
  other: "Retail, public sector and anything else",
};

export const SELECTABLE_SECTORS: Sector[] = [
  "engineering", "technology", "finance_tech", "infrastructure", "installer_services", "other",
];

export const DEFAULT_SECTORS: Sector[] = ["engineering", "technology", "finance_tech", "infrastructure"];

export const VALID_SECTORS = new Set<string>(Object.keys(SECTOR_LABELS));
