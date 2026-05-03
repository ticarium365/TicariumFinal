import { Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, ShadingType } from "docx";
import { C, CONTENT_W, borders, noBorders } from "./constants.mjs";
import { gap, p, run, sp } from "./helpers.mjs";

/** @returns {import('docx').FileChild[] | import('docx').Paragraph[]} */
export function coverBlocks() {
  return [
    gap(200),
    new Paragraph({
      children: [
        new TextRun({
          text: "TICARIUM365",
          font: "Inter",
          size: 80,
          bold: true,
          color: C.navy,
        }),
      ],
      alignment: AlignmentType.LEFT,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Cursor Prompt Playbook",
          font: "Inter",
          size: 40,
          color: C.blue,
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: sp(60, 80),
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Production-ready delivery: UI/UX · Architecture · Theme · Testing · Launch",
          font: "Inter",
          size: 22,
          color: C.midGray,
          italics: true,
        }),
      ],
      spacing: sp(0, 160),
    }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              shading: { fill: C.lightBlue, type: ShadingType.CLEAR },
              margins: { top: 160, bottom: 160, left: 240, right: 240 },
              width: { size: CONTENT_W, type: WidthType.DXA },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Stack: TypeScript · React · Vite · Express · Drizzle ORM · PostgreSQL · pnpm monorepo",
                      font: "Inter",
                      size: 19,
                      color: C.blue,
                    }),
                  ],
                  spacing: sp(0, 40),
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Repo layout: artifacts/prosan (frontend) · artifacts/api-server (backend) · lib/db (schema)",
                      font: "Inter",
                      size: 19,
                      color: C.blue,
                    }),
                  ],
                  spacing: sp(0, 40),
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "53 screens shipped · multi-tenant SaaS · Iyzico payments · Cloudflare proxy",
                      font: "Inter",
                      size: 19,
                      color: C.blue,
                    }),
                  ],
                  spacing: sp(0, 0),
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    gap(160),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [640, 2800, 3600, 2598],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders,
              shading: { fill: C.navy, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              width: { size: 640, type: WidthType.DXA },
              children: [p([run("#", { bold: true, color: C.white })])],
            }),
            new TableCell({
              borders,
              shading: { fill: C.navy, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              width: { size: 2800, type: WidthType.DXA },
              children: [p([run("Phase", { bold: true, color: C.white })])],
            }),
            new TableCell({
              borders,
              shading: { fill: C.navy, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              width: { size: 3600, type: WidthType.DXA },
              children: [p([run("Goal", { bold: true, color: C.white })])],
            }),
            new TableCell({
              borders,
              shading: { fill: C.navy, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              width: { size: 2598, type: WidthType.DXA },
              children: [p([run("Prompts", { bold: true, color: C.white })])],
            }),
          ],
        }),
        ...[
          ["1", "Design System & Theme", "Token setup, typography, color, spacing", "P1-A → P1-F"],
          ["2", "Component Audit & Refactor", "Fix all 53 screens to design system", "P2-A → P2-G"],
          ["3", "UX / Interaction", "Empty states, loading, error, onboarding", "P3-A → P3-E"],
          ["4", "Architecture & Performance", "N+1, bundle, API contract, auth hardening", "P4-A → P4-F"],
          ["5", "Security & Prod Readiness", "Tenant isolation, billing, env, smoke tests", "P5-A → P5-E"],
          ["6", "Testing & QA", "Unit, E2E, critical flows, regression suite", "P6-A → P6-D"],
          ["7", "Launch Checklist", "Final go/no-go, monitoring, rollback plan", "P7-A → P7-C"],
        ].map(([num, phase, goal, prompts]) =>
          new TableRow({
            children: [
              new TableCell({
                borders,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                width: { size: 640, type: WidthType.DXA },
                shading: { fill: C.lightGray, type: ShadingType.CLEAR },
                children: [p([run(num, { bold: true, color: C.blue })])],
              }),
              new TableCell({
                borders,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                width: { size: 2800, type: WidthType.DXA },
                children: [p([run(phase, { bold: true, color: C.navy })])],
              }),
              new TableCell({
                borders,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                width: { size: 3600, type: WidthType.DXA },
                children: [p([run(goal, { color: C.gray })])],
              }),
              new TableCell({
                borders,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                width: { size: 2598, type: WidthType.DXA },
                shading: { fill: C.codeBg, type: ShadingType.CLEAR },
                children: [
                  p([run(prompts, { font: "Courier New", size: 18, color: C.code })]),
                ],
              }),
            ],
          }),
        ),
      ],
    }),
  ];
}
