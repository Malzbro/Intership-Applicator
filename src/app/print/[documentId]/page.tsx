import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Print-friendly render of a generated document: open, Ctrl+P, save as PDF.
export default async function PrintPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("kind, version, content_md")
    .eq("id", documentId)
    .single();

  if (!doc?.content_md) {
    return <p className="text-sm text-stone-500">Document not found.</p>;
  }

  return (
    <div className="print-doc mx-auto max-w-[720px] bg-white text-black p-10 my-4 shadow print:shadow-none print:my-0 print:p-0">
      <style>{`
        @media print {
          nav, footer { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
        }
        .print-doc h1 { font-size: 1.6rem; font-weight: 700; text-align: center; margin: 0 0 .25rem; }
        .print-doc h2 { font-size: 1.05rem; font-weight: 700; border-bottom: 1px solid #999;
                        margin: 1.1rem 0 .4rem; padding-bottom: .15rem; }
        .print-doc p { margin: 0 0 .6rem; line-height: 1.45; }
        .print-doc ul { margin: 0 0 .6rem 1.1rem; }
        .print-doc li { margin: .15rem 0; line-height: 1.4; }
        .print-doc .center { text-align: center; color: #444; font-size: .9rem; }
      `}</style>
      {renderMarkdown(doc.content_md)}
    </div>
  );
}

function inline(text: string, key: number) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${key}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={`${key}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  let k = 0;

  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={k++}>
          {bullets.map((b, i) => <li key={i}>{inline(b, k * 100 + i)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };

  for (const [idx, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("# ")) out.push(<h1 key={k++}>{line.slice(2)}</h1>);
    else if (line.startsWith("## ")) out.push(<h2 key={k++}>{inline(line.slice(3), k)}</h2>);
    else if (idx === 1) out.push(<p key={k++} className="center">{line}</p>);
    else out.push(<p key={k++}>{inline(line, k)}</p>);
  }
  flush();
  return out;
}
