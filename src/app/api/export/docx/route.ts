import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from "docx";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const documentId = req.nextUrl.searchParams.get("id");
  if (!documentId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: doc } = await supabase
    .from("documents")
    .select("kind, version, content_md")
    .eq("id", documentId)
    .single();
  if (!doc?.content_md) return NextResponse.json({ error: "not found" }, { status: 404 });

  const paragraphs = markdownToDocx(doc.content_md);
  const file = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ children: paragraphs }],
  });
  const buffer = await Packer.toBuffer(file);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${doc.kind}-v${doc.version}.docx"`,
    },
  });
}

function inlineRuns(text: string): TextRun[] {
  // handles **bold** and *italic* fragments
  const runs: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push(new TextRun(text.slice(last, m.index)));
    const token = m[0];
    if (token.startsWith("**")) runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    else runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    last = m.index! + token.length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs;
}

function markdownToDocx(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      out.push(new Paragraph({ spacing: { after: 60 } }));
    } else if (line.startsWith("# ")) {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: inlineRuns(line.slice(2)),
      }));
    } else if (line.startsWith("## ")) {
      out.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: inlineRuns(line.slice(3)),
        spacing: { before: 200, after: 80 },
      }));
    } else if (line.startsWith("- ")) {
      out.push(new Paragraph({
        bullet: { level: 0 },
        children: inlineRuns(line.slice(2)),
      }));
    } else {
      out.push(new Paragraph({ children: inlineRuns(line), spacing: { after: 80 } }));
    }
  }
  return out;
}
