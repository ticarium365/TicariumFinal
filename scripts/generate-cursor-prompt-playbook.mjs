/**
 * Generates docs/Ticarium365-Cursor-Prompt-Playbook.docx (Cursor prompt playbook, Phases 1–7).
 * Run from repo root: pnpm run docs:cursor-playbook
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import {
  Document,
  Packer,
  Header,
  Paragraph,
  TextRun,
  PageNumber,
  TabStopType,
  TabStopPosition,
  BorderStyle,
} from "docx";
import { PAGE_W, PAGE_H, MARGIN, documentStyles, numberingConfig, C } from "./cursor-playbook/constants.mjs";
import { sp, pb } from "./cursor-playbook/helpers.mjs";
import { coverBlocks } from "./cursor-playbook/cover.mjs";
import { phase1Blocks } from "./cursor-playbook/phase1.mjs";
import { phase2Blocks } from "./cursor-playbook/phase2.mjs";
import { phase3Blocks } from "./cursor-playbook/phase3.mjs";
import { phase4Blocks } from "./cursor-playbook/phase4.mjs";
import { phase5Blocks } from "./cursor-playbook/phase5.mjs";
import { phase6Blocks } from "./cursor-playbook/phase6.mjs";
import { phase7Blocks } from "./cursor-playbook/phase7.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const children = [
  ...coverBlocks(),
  pb(),
  ...phase1Blocks(),
  ...phase2Blocks(),
  ...phase3Blocks(),
  ...phase4Blocks(),
  ...phase5Blocks(),
  ...phase6Blocks(),
  ...phase7Blocks(),
];

const doc = new Document({
  styles: documentStyles,
  numbering: numberingConfig,
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Ticarium365",
                  font: "Inter",
                  size: 16,
                  bold: true,
                  color: C.navy,
                }),
                new TextRun({
                  text: "  ·  Cursor Prompt Playbook",
                  font: "Inter",
                  size: 16,
                  color: C.midGray,
                }),
                new TextRun({ text: "\t", font: "Inter", size: 16 }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: "Inter",
                  size: 16,
                  color: C.midGray,
                }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 2, color: C.border },
              },
              spacing: sp(0, 80),
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const outPath = path.join(repoRoot, "docs", "Ticarium365-Cursor-Prompt-Playbook.docx");
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buf);
console.log("Wrote", outPath);
