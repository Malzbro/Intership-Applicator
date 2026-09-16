import { clean } from "@/lib/env";

// Voyage AI embeddings — 1024 dimensions, matches vector(1024) columns.
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

export class EmbeddingRateLimitError extends Error {}

// Accounts without a payment method are held to 3 requests and 10K tokens a
// minute, so a 429 is expected rather than exceptional: wait and retry while
// the caller's deadline allows, then give up with a typed error.
export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document",
  opts: { deadline?: number } = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clean(process.env.VOYAGE_API_KEY)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts.map((t) => t.slice(0, 16000)),
        input_type: inputType,
        output_dimension: 1024,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data.map((d) => d.embedding);
    }
    if (res.status === 429) {
      const waitMs = (Number(res.headers.get("retry-after")) || 21) * 1000;
      const canWait = attempt < 2 && (!opts.deadline || Date.now() + waitMs < opts.deadline);
      if (canWait) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new EmbeddingRateLimitError(
        "Voyage rate limit reached (accounts without a payment method get 3 requests/minute)"
      );
    }
    throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  }
}

export async function embedOne(
  text: string,
  inputType: "document" | "query" = "document",
  opts: { deadline?: number } = {}
): Promise<number[]> {
  const [v] = await embed([text], inputType, opts);
  return v;
}
