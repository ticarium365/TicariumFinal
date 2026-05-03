import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  VerticalAlign,
  AlignmentType,
} from "docx";
import { C, CONTENT_W, noBorder, noBorders } from "./constants.mjs";

export const sp = (before = 0, after = 0) => ({ before, after });

export const leftAccent = (color) => ({
  top: noBorder,
  bottom: noBorder,
  right: noBorder,
  left: { style: BorderStyle.SINGLE, size: 16, color },
});

export function run(text, opts = {}) {
  return new TextRun({ text, font: "Inter", size: 20, color: C.gray, ...opts });
}

export function codeRun(text) {
  return new TextRun({ text, font: "JetBrains Mono", size: 18, color: C.code });
}

export function p(children, opts = {}) {
  const kids =
    typeof children === "string" ? [run(children, opts.runOpts || {})] : children;
  return new Paragraph({ children: kids, spacing: sp(40, 40), ...opts });
}

export function gap(n = 80) {
  return new Paragraph({ children: [run("")], spacing: sp(n, 0) });
}

export function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}

export function sectionBand(num, title, subtitle) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            shading: { fill: C.navy, type: ShadingType.CLEAR },
            margins: { top: 200, bottom: 200, left: 320, right: 320 },
            width: { size: CONTENT_W, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `PHASE ${num}  `,
                    font: "Inter",
                    size: 18,
                    bold: true,
                    color: C.midBlue,
                  }),
                  new TextRun({
                    text: `— ${title.toUpperCase()}`,
                    font: "Inter",
                    size: 18,
                    bold: true,
                    color: "ADBFD6",
                  }),
                ],
                spacing: sp(0, 60),
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: title,
                    font: "Inter",
                    size: 36,
                    bold: true,
                    color: C.white,
                  }),
                ],
                spacing: sp(0, 60),
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: subtitle,
                    font: "Inter",
                    size: 20,
                    color: "9DB8D0",
                    italics: true,
                  }),
                ],
                spacing: sp(0, 0),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export function h2(text) {
  return new Paragraph({
    children: [
      new TextRun({ text, font: "Inter", size: 26, bold: true, color: C.navy }),
    ],
    spacing: sp(320, 100),
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.lightBlue } },
  });
}

export function h3(text) {
  return new Paragraph({
    children: [
      new TextRun({ text, font: "Inter", size: 22, bold: true, color: C.blue }),
    ],
    spacing: sp(200, 60),
  });
}

export function promptBox(label, phase, promptText, note = null) {
  const rows = [];

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders: noBorders,
          shading: { fill: C.navy, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          width: { size: CONTENT_W, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: label,
                  font: "Inter",
                  size: 22,
                  bold: true,
                  color: C.white,
                }),
                new TextRun({
                  text: `   ·  ${phase}`,
                  font: "Inter",
                  size: 18,
                  color: "9DB8D0",
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  );

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders: {
            top: noBorder,
            bottom: noBorder,
            right: noBorder,
            left: { style: BorderStyle.SINGLE, size: 12, color: C.blue },
          },
          shading: { fill: C.codeBg, type: ShadingType.CLEAR },
          margins: { top: 160, bottom: 160, left: 240, right: 240 },
          width: { size: CONTENT_W, type: WidthType.DXA },
          children: promptText.split("\n").map(
            (line) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    font: "Courier New",
                    size: 19,
                    color: C.code,
                  }),
                ],
                spacing: sp(20, 20),
              }),
          ),
        }),
      ],
    }),
  );

  if (note) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            shading: { fill: C.lightAmber, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 200, right: 200 },
            width: { size: CONTENT_W, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "⚠ ",
                    font: "Inter",
                    size: 18,
                    bold: true,
                    color: C.amber,
                  }),
                  new TextRun({ text: note, font: "Inter", size: 18, color: C.amber }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows,
  });
}

export function contextBox(text) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            shading: { fill: C.lightGray, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            width: { size: CONTENT_W, type: WidthType.DXA },
            children: text.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: line,
                      font: "Inter",
                      size: 19,
                      color: C.midGray,
                    }),
                  ],
                  spacing: sp(20, 20),
                }),
            ),
          }),
        ],
      }),
    ],
  });
}

export function stepRow(num, title, desc) {
  const numCell = new TableCell({
    borders: noBorders,
    width: { size: 640, type: WidthType.DXA },
    shading: { fill: C.blue, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(num),
            font: "Inter",
            size: 22,
            bold: true,
            color: C.white,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
  const textCell = new TableCell({
    borders: noBorders,
    width: { size: CONTENT_W - 640, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 160, right: 0 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            font: "Inter",
            size: 21,
            bold: true,
            color: C.navy,
          }),
        ],
        spacing: sp(0, 30),
      }),
      new Paragraph({
        children: [
          new TextRun({ text: desc, font: "Inter", size: 19, color: C.gray }),
        ],
        spacing: sp(0, 0),
      }),
    ],
  });
  return new TableRow({ children: [numCell, textCell] });
}
