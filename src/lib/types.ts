export type ParsedCv = {
  full_name: string;
  contact: { email?: string; phone?: string; location?: string; links?: string[] };
  education: {
    institution: string;
    course: string;
    start?: string;
    end?: string;
    grade?: string;
    modules?: string[];
  }[];
  skills: { name: string; level?: string; evidence?: string }[];
  projects: {
    id: string; // stable ref like "proj-1", used by source_ref
    name: string;
    description: string;
    technologies?: string[];
    outcomes?: string[];
  }[];
  experience: {
    id: string; // "exp-1"
    employer: string;
    title: string;
    start?: string;
    end?: string;
    bullets: string[];
  }[];
  extras?: string[];
};

export type ResearchBundle = {
  company_overview: { text: string; source_url: string }[];
  stated_values: { value: string; quote: string; source_url: string }[];
  notable_projects: { name: string; detail: string; source_url: string }[];
  technical_stack: { item: string; source_url: string }[];
  role_summary: string;
};

export type TailoredCv = {
  summary?: string;
  sections: {
    heading: string;
    entries: {
      title: string;
      subtitle?: string;
      dates?: string;
      bullets: { text: string; source_ref: string }[];
    }[];
  }[];
  skills_line?: string;
};

export type Critique = {
  overall_score: number; // 0-10
  unsupported_claims: { text: string; document: "cv" | "cover_letter" }[];
  generic_sentences: { text: string; document: "cv" | "cover_letter" }[];
  length_issues: string[];
  suggestions: string[];
};

export type MatchReasons = {
  hard_filters: string[];
  keyword_hits: { keyword: string; weight: number; evidence: string }[];
  preference: string[];
  summary: string;
};

export type NormalisedJob = {
  source: string;
  source_ref: string;
  title: string;
  url?: string;
  company_name: string;
  company_domain?: string;
  location?: string;
  remote?: boolean;
  description?: string;
  requirements?: string;
  salary?: string;
  posted_at?: string;
  closes_at?: string;
};

export type SourceAdapter = {
  name: string;
  fetchJobs: (config: Record<string, unknown>) => Promise<NormalisedJob[]>;
};

export type ApplicationStatus =
  | "shortlist" | "drafted" | "ready" | "sent"
  | "replied" | "interview" | "offer" | "rejected";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "shortlist", "drafted", "ready", "sent", "replied", "interview", "offer", "rejected",
];
