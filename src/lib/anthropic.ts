import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Every call names its task; the task picks the model and how hard it thinks.
//   bulk    — runs over hundreds of rows (company summaries, domain lookups,
//             job extraction from pages). Separate model env so it can be
//             pointed at a cheaper model without touching letter quality.
//   extract — one-off structured extraction that matters (CV parse, research).
//   write   — the applicant-facing prose (tailored CV, cover letter).
//   review  — critique and style-profile work.
export type Task = "bulk" | "extract" | "write" | "review";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
export const BULK_MODEL = process.env.ANTHROPIC_MODEL_BULK || MODEL;

const EFFORT: Record<Task, "low" | "medium" | "high"> = {
  bulk: "low",
  extract: "medium",
  write: "high",
  review: "medium",
};

// Thinking tokens count against max_tokens, so this is deliberately roomy;
// you pay only for what is generated.
const MAX_TOKENS = 16000;

export class ModelOutputError extends Error {}

function modelFor(task: Task): string {
  return task === "bulk" ? BULK_MODEL : MODEL;
}

// Haiku 4.5 rejects the effort parameter; the server-side refusal fallback is
// documented for the Opus 5 / Fable 5.1 tier.
const supportsEffort = (model: string) => !model.startsWith("claude-haiku");
const supportsFallback = (model: string) =>
  model.startsWith("claude-opus-5") || model.startsWith("claude-fable-5");

async function call(opts: { system: string; user: string; task: Task }): Promise<string> {
  const model = modelFor(opts.task);
  const fallback = supportsFallback(model);

  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    ...(supportsEffort(model) ? { output_config: { effort: EFFORT[opts.task] } } : {}),
    ...(fallback
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });

  if (response.stop_reason === "refusal") {
    throw new ModelOutputError(
      `The model declined this request${
        response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""
      }`
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ModelOutputError("The model ran out of output room before finishing.");
  }

  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function claudeText(opts: {
  system: string;
  user: string;
  task: Task;
}): Promise<string> {
  return call(opts);
}

export async function claudeJson<T>(opts: {
  system: string;
  user: string;
  task: Task;
}): Promise<T> {
  const text = await call(opts);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new ModelOutputError(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
