/**
 * Markdown → Word (.docx) dönüştürücü
 * Kullanım: pnpm --filter @workspace/scripts run md2docx <giris.md> <cikis.docx>
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" };

function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // code fence
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) { buf.push(lines[i]!); i++; }
      i++;
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    // heading
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1]!.length as 1|2|3|4, text: h[2]!.trim() });
      i++;
      continue;
    }
    // hr
    if (/^---+\s*$/.test(line)) { blocks.push({ kind: "hr" }); i++; continue; }
    // table (header | --- | row)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1]!)) {
      const splitRow = (s: string) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    // list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]!) || /^\s*\d+\.\s+/.test(lines[i]!))) {
        items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", items, ordered });
      continue;
    }
    // blank
    if (line.trim() === "") { i++; continue; }
    // paragraph: lines until blank
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !lines[i]!.startsWith("#") && !lines[i]!.startsWith("```") && !/^\s*[-*]\s+/.test(lines[i]!) && !/^\s*\d+\.\s+/.test(lines[i]!) && !(lines[i]!.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1]!)) && !/^---+\s*$/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    if (buf.length) blocks.push({ kind: "paragraph", text: buf.join(" ") });
  }
  return blocks;
}

function inlineRuns(text: string): TextRun[] {
  // **bold**, *italic*, `code`, [link](url) → düz metin
  const runs: TextRun[] = [];
  // Önce link ve code'u koru, sonra bold/italic
  const tokens: { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] = [];
  let cursor = 0;
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) tokens.push({ text: text.slice(cursor, m.index) });
    const tok = m[0]!;
    if (tok.startsWith("**")) tokens.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("*")) tokens.push({ text: tok.slice(1, -1), italic: true });
    else if (tok.startsWith("`")) tokens.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) tokens.push({ text: `${lm[1]} (${lm[2]})` });
    }
    cursor = m.index + tok.length;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  for (const t of tokens) {
    runs.push(new TextRun({
      text: t.text,
      bold: t.bold,
      italics: t.italic,
      font: t.code ? "Consolas" : undefined,
      shading: t.code ? { type: ShadingType.SOLID, color: "F1F5F9", fill: "F1F5F9" } : undefined,
    }));
  }
  return runs.length ? runs : [new TextRun(text)];
}

function blocksToDocxChildren(blocks: Block[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") {
      const lvl = ({ 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 } as const)[b.level];
      out.push(new Paragraph({
        heading: lvl,
        children: inlineRuns(b.text),
        spacing: { before: 240, after: 120 },
      }));
    } else if (b.kind === "paragraph") {
      out.push(new Paragraph({ children: inlineRuns(b.text), spacing: { after: 120 } }));
    } else if (b.kind === "code") {
      const codeLines = b.text.split("\n");
      for (const cl of codeLines) {
        out.push(new Paragraph({
          children: [new TextRun({ text: cl || " ", font: "Consolas", size: 18 })],
          shading: { type: ShadingType.SOLID, color: "F1F5F9", fill: "F1F5F9" },
          spacing: { before: 0, after: 0 },
        }));
      }
      out.push(new Paragraph({ children: [new TextRun(" ")], spacing: { after: 120 } }));
    } else if (b.kind === "list") {
      b.items.forEach((it, idx) => {
        out.push(new Paragraph({
          children: inlineRuns(`${b.ordered ? `${idx + 1}.` : "•"}  ${it}`),
          indent: { left: 360 },
          spacing: { after: 60 },
        }));
      });
    } else if (b.kind === "table") {
      const rowToCells = (cells: string[], header = false) =>
        cells.map(c => new TableCell({
          children: [new Paragraph({
            children: inlineRuns(c).map(r => {
              // header olduğunda bold yap
              return header ? new TextRun({ text: (r as any).options?.text ?? c, bold: true }) : r;
            }),
            spacing: { before: 60, after: 60 },
          })],
          shading: header ? { type: ShadingType.SOLID, color: "0F172A", fill: "0F172A" } : undefined,
          width: { size: Math.floor(9000 / Math.max(cells.length, 1)), type: WidthType.DXA },
        }));
      const rows: TableRow[] = [
        new TableRow({ children: rowToCells(b.headers, true), tableHeader: true }),
        ...b.rows.map(r => new TableRow({ children: rowToCells(r) })),
      ];
      out.push(new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
          left:   { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
          right:  { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
          insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
        },
      }));
      out.push(new Paragraph({ children: [new TextRun(" ")], spacing: { after: 120 } }));
    } else if (b.kind === "hr") {
      out.push(new Paragraph({
        children: [new TextRun({ text: "" })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 } },
        spacing: { before: 120, after: 120 },
      }));
    }
  }
  return out;
}

async function main() {
  const inFile = process.argv[2] || "TEKNIK_DOKUMAN.md";
  const outFile = process.argv[3] || "TEKNIK_DOKUMAN.docx";
  const md = await fs.readFile(path.resolve(inFile), "utf8");
  const blocks = parseMarkdown(md);
  const doc = new Document({
    creator: "Ticarium365",
    title: "Ticarium365 Teknik Dokümantasyon",
    description: "Otomatik üretilmiş teknik doküman",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: blocksToDocxChildren(blocks),
    }],
  });
  const buf = await Packer.toBuffer(doc);
  await fs.writeFile(path.resolve(outFile), buf);
  console.log(`✅ ${outFile} oluşturuldu (${(buf.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
