// The facts bank: things that never fit on a CV but are what a cover letter
// actually needs. Asked once, then drawn on selectively per company.

export const FACT_QUESTIONS: { key: string; question: string; hint: string }[] = [
  {
    key: "why_discipline",
    question: "Why electrical/electronic engineering? What made it click rather than another branch?",
    hint: "The honest reason, not the UCAS-statement reason.",
  },
  {
    key: "origin_moment",
    question: "Describe one specific moment that got you into electronics.",
    hint: "A thing you took apart, a circuit that finally worked, a fault you chased down.",
  },
  {
    key: "hobby_project",
    question: "What have you built outside of coursework?",
    hint: "Side projects, repairs, things half-finished in a drawer. Specifics beat scope.",
  },
  {
    key: "what_you_want",
    question: "What do you actually want out of a summer internship?",
    hint: "Beyond 'experience' — what would make it a good twelve weeks?",
  },
  {
    key: "energises_drains",
    question: "What kind of engineering work energises you, and what drains you?",
    hint: "Debugging vs designing, solo vs team, hardware vs firmware.",
  },
  {
    key: "admired_work",
    question: "Is there a company, product or piece of engineering you genuinely admire? Why?",
    hint: "Naming why something is well-engineered says a lot about how you think.",
  },
  {
    key: "struggled_through",
    question: "What have you found hard and worked through?",
    hint: "A module, a project that failed, a skill that came slowly.",
  },
  {
    key: "outside_engineering",
    question: "What do you do outside engineering that says something about how you work?",
    hint: "Sport, music, making, organising, teaching.",
  },
];

// Passed whole to the letter prompt — there are only ~8 short entries, so
// letting the model choose the best-fitting one or two beats pre-filtering,
// and it reports back which it used so the loop can learn.
export function factsToPrompt(
  facts: { prompt_key: string; question: string; answer: string | null }[]
): string {
  const answered = facts.filter((f) => f.answer?.trim());
  if (answered.length === 0) return "";
  return [
    "FACTS BANK — things true about this person that are not on the CV.",
    "Select the ONE or TWO that genuinely connect to this company's stated values or work. Ignore the rest. Never use one that does not fit; a letter with one real connection beats one with three forced ones.",
    ...answered.map((f) => `[${f.prompt_key}] ${f.question}\n  -> ${f.answer!.trim().slice(0, 1200)}`),
  ].join("\n\n");
}
