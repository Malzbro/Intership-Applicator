import { clean } from "@/lib/env";

// Voyage AI embeddings — 1024 dimensions, matches vector(1024) columns.
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  if (texts.length === 0) return [];
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
  if (!res.ok) {
    throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  inputType: "document" | "query" = "document"
): Promise<number[]> {
  const [v] = await embed([text], inputType);
  return v;
}
