import { BorderStyle, ShadingType, LevelFormat, AlignmentType } from "docx";

/** @type {Record<string, string>} */
export const C = {
  navy: "0F2444",
  blue: "1A56A0",
  lightBlue: "E8F0FB",
  midBlue: "4A7FC1",
  green: "0D6E4B",
  lightGreen: "E6F4EE",
  amber: "92600A",
  lightAmber: "FEF3E2",
  red: "991B1B",
  lightRed: "FEE2E2",
  gray: "374151",
  midGray: "6B7280",
  lightGray: "F3F4F6",
  border: "D1D5DB",
  white: "FFFFFF",
  code: "1E3A5F",
  codeBg: "EFF6FF",
};

export const PAGE_W = 11906;
export const PAGE_H = 16838;
export const MARGIN = 1134;
export const CONTENT_W = PAGE_W - MARGIN * 2;

export const b = { style: BorderStyle.SINGLE, size: 1, color: C.border };
export const borders = { top: b, bottom: b, left: b, right: b };
export const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white };
export const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

export const documentStyles = {
  default: { document: { run: { font: "Inter", size: 20, color: C.gray } } },
  paragraphStyles: [
    {
      id: "Heading1",
      name: "Heading 1",
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { size: 36, bold: true, font: "Inter", color: C.navy },
      paragraph: { spacing: { before: 400, after: 120 }, outlineLevel: 0 },
    },
    {
      id: "Heading2",
      name: "Heading 2",
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { size: 26, bold: true, font: "Inter", color: C.navy },
      paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 },
    },
  ],
};

export const numberingConfig = {
  config: [
    {
      reference: "bullets",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 560, hanging: 280 } },
            run: { font: "Inter", size: 20 },
          },
        },
      ],
    },
  ],
};
