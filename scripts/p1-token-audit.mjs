/**
 * One-off: P1-A design token audit for artifacts/prosan/src
 * Run: node scripts/p1-token-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("artifacts/prosan/src");
const EXT = new Set([".tsx", ".ts", ".css", ".jsx"]);

const HEX = /\B#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB = /\brgba?\([^)]*\)/g;
const HSL_ANY = /\bhsl(?:a)?\([^)]+\)/g;
const ARBITRARY_COLOR_CLASS =
  /(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow)-\[(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|hsl\([^)]+\))\]/g;
const TEXT_ARBITRARY = /(?:^|[\s"'`])text-\[([^\]]+)\]/g;
const SPACING_ARBITRARY =
  /(?:^|[\s"'(,])(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y|w|h|min-w|min-h|max-w|max-h|size|top|bottom|left|right|inset|translate-[xy]|ring|rounded|rounded-(?:t|tr|tl|b|br|bl|r|l|ee|ss)?)-\[([^\]]+)\]/g;
const STYLE_FONTSIZE = /fontSize:\s*["']([^"']+)["']/g;
const STYLE_DIM = /(?:width|height|maxHeight|minWidth|padding|margin|gap|top|left|bottom|right|borderRadius)\s*:\s*["']([^"']*\d[^"']*)["']/g;

function normalizeHex(raw) {
  const h = raw.slice(1);
  if (h.length === 3) {
    return (
      "#" +
      h
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    );
  }
  return "#" + h.toLowerCase();
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (EXT.has(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

function addOcc(map, key, file, line) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push({ file, line });
}

const files = walk(SRC);
const hexOcc = new Map();
const rgbOcc = new Map();
const hslOcc = new Map();
const arbColorOcc = new Map();
const textArbOcc = new Map();
const spaceArbOcc = new Map();
const fontInlineOcc = new Map();
const roundedOcc = new Map();

/** Tailwind default spacing keys that map to design scale (exclude arbitrary) */
const TAILWIND_SPACE_OK = new Set([
  "px",
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
]);

/** text-xs .. text-9xl and text-sm etc. */
const TEXT_SCALE_PREFIX = /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(\/|\s|$)/;

function isSpacingOffScale(token) {
  if (token == null) return false;
  const t = String(token).trim();
  if (/^\[.+\]$/.test(t)) return false;
  if (!/[0-9]/.test(t)) return false;
  if (t.includes("var(") || t.includes("calc(")) return false;
  const px = t.match(/^(\d+(?:\.\d+)?)px$/);
  const rem = t.match(/^(\d+(?:\.\d+)?)rem$/);
  if (px) {
    const n = Number(px[1]);
    if (Number.isInteger(n) && n % 4 === 0 && n >= 4 && n <= 384) return false;
    return true;
  }
  if (rem) {
    const n = Number(rem[1]) * 16;
    if (Number.isInteger(n) && n % 4 === 0 && n >= 4) return false;
    return true;
  }
  if (/^-?(\d+)$/.test(t)) return !TAILWIND_SPACE_OK.has(t.replace(/^-/, ""));
  if (/^\d+\/\d+$/.test(t)) return false;
  if (t === "full" || t === "screen" || t === "auto" || t === "min" || t === "max" || t === "fit") return false;
  return true;
}

function isTypographyOffScale(inner) {
  const s = inner.trim();
  if (s === "0.8rem") return true;
  if (/^\d+px$/.test(s)) {
    const n = parseInt(s, 10);
    const ok = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40].includes(n);
    return !ok;
  }
  if (/^\d+(\.\d+)?rem$/.test(s)) return true;
  return false;
}

for (const abs of files) {
  const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    let m;
    const hexRe = new RegExp(HEX.source, "g");
    while ((m = hexRe.exec(line))) {
      addOcc(hexOcc, normalizeHex(m[0]), rel, lineNo);
    }
    const rgbRe = new RegExp(RGB.source, "g");
    while ((m = rgbRe.exec(line))) {
      addOcc(rgbOcc, m[0].replace(/\s+/g, " "), rel, lineNo);
    }
    const hslRe = new RegExp(HSL_ANY.source, "g");
    while ((m = hslRe.exec(line))) {
      addOcc(hslOcc, m[0].replace(/\s+/g, " "), rel, lineNo);
    }
    let c;
    const ac = new RegExp(ARBITRARY_COLOR_CLASS.source, "g");
    while ((c = ac.exec(line))) {
      addOcc(arbColorOcc, c[1], rel, lineNo);
    }
    const ta = new RegExp(TEXT_ARBITRARY.source, "g");
    while ((c = ta.exec(line))) {
      if (isTypographyOffScale(c[1])) addOcc(textArbOcc, `text-[${c[1]}]`, rel, lineNo);
    }
    const sp = new RegExp(SPACING_ARBITRARY.source, "g");
    while ((c = sp.exec(line))) {
      const mm = c[0].match(/([\w.-]+)-\[([^\]]+)\]\s*$/);
      if (!mm) continue;
      const prefix = mm[1];
      const bracket = mm[2];
      if (prefix.startsWith("rounded")) {
        if (/px|rem|%/.test(bracket) || /^\d/.test(bracket))
          addOcc(roundedOcc, `${prefix}-[${bracket}]`, rel, lineNo);
        continue;
      }
      if (isSpacingOffScale(bracket)) addOcc(spaceArbOcc, `${prefix}-[${bracket}]`, rel, lineNo);
    }
    const fsz = new RegExp(STYLE_FONTSIZE.source, "g");
    while ((c = fsz.exec(line))) {
      addOcc(fontInlineOcc, c[1], rel, lineNo);
    }
  });
}

function summarize(occMap, maxRows = 80) {
  const rows = [];
  for (const [val, occ] of occMap) {
    const byFile = new Map();
    for (const { file, line } of occ) {
      if (!byFile.has(file)) byFile.set(file, new Set());
      byFile.get(file).add(line);
    }
    const parts = [];
    for (const [f, set] of byFile) {
      const lines = [...set].sort((a, b) => a - b).slice(0, 5);
      const extra = set.size > 5 ? ` (+${set.size - 5} more lines)` : "";
      parts.push(`${f}:L${lines.join(",")}${extra}`);
    }
    rows.push({ value: val, count: occ.length, files: byFile.size, detail: parts.slice(0, 4).join(" · ") });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, maxRows);
}

const top10Hex = summarize(hexOcc, 500)
  .slice(0, 10)
  .map((r, i) => ({ rank: i + 1, ...r }));

console.log("=== P1-A TOKEN AUDIT ===\n");
console.log("## Top 10 hex color literals (by occurrence count)\n");
console.log("| Rank | Value | Occurrences | Files | Sample locations |");
console.log("|------|-------|-------------|-------|------------------|");
for (const r of top10Hex) {
  console.log(`| ${r.rank} | \`${r.value}\` | ${r.count} | ${r.files} | ${r.detail.slice(0, 120)}${r.detail.length > 120 ? "…" : ""} |`);
}

console.log("\n## Colors — rgba/hsla (summary; first 25 by count)\n");
console.log("| Value (truncated) | Occurrences | Files | Sample |");
console.log("|-------------------|-------------|-------|--------|");
for (const r of summarize(rgbOcc, 25)) {
  const v = r.value.length > 55 ? r.value.slice(0, 52) + "…" : r.value;
  console.log(`| \`${v}\` | ${r.count} | ${r.files} | ${r.detail.slice(0, 80)}… |`);
}

console.log("\n## Colors — hsl() / space syntax in TS/TSX (first 20)\n");
for (const r of summarize(hslOcc, 20)) {
  console.log(`- \`${r.value.slice(0, 70)}\` — ${r.count}× in ${r.files} files`);
}

console.log("\n## Colors — Tailwind arbitrary color classes (e.g. bg-[#...]) — first 15\n");
for (const r of summarize(arbColorOcc, 15)) {
  console.log(`- \`${r.value}\` — ${r.count}×`);
}

console.log("\n## Typography — arbitrary `text-[…]` off default scale (common: 9–11px, 0.8rem)\n| Class / size | Occurrences | Sample |");
console.log("|--------------|-------------|--------|");
for (const r of summarize(textArbOcc, 40)) {
  console.log(`| \`${r.value.replace(/`/g, "")}\` | ${r.count} | ${r.detail.slice(0, 100)} |`);
}

console.log(
  "\n## Typography — inline `fontSize` (pt/mm/odd rem) — barcodes & print\n| Value | Occurrences | Sample |",
);
console.log("|-------|-------------|--------|");
for (const r of summarize(fontInlineOcc, 30)) {
  console.log(`| \`${r.value}\` | ${r.count} | ${r.detail.slice(0, 90)} |`);
}

console.log("\n## Spacing / size — arbitrary `[…]` likely off 4px rhythm (sample)\n| Token snippet | Occurrences | Sample |");
console.log("|---------------|-------------|--------|");
for (const r of summarize(spaceArbOcc, 45)) {
  const key = r.value.length > 70 ? r.value.slice(0, 67) + "…" : r.value;
  console.log(`| \`${key}\` | ${r.count} | ${r.detail.slice(0, 85)} |`);
}

console.log("\n## Border-radius — arbitrary rounded (sample)\n| Class | Occurrences | Sample |");
console.log("|-------|-------------|--------|");
for (const r of summarize(roundedOcc, 25)) {
  console.log(`| \`${r.value}\` | ${r.count} | ${r.detail.slice(0, 85)} |`);
}

console.log(
  `\n## Notes\n- **index.css** defines semantic HSL tokens (\`hsl(var(--primary))\` etc.); those are the intended “token layer”, but many pages still use **raw hex/rgba** in \`style={{}}\` and gradients.\n- **Chart / SVG / barcode print** stacks use hex by necessity in several places; candidate tokens still apply for *app chrome*.\n- Full file list: **${files.length}** files under \`artifacts/prosan/src\`.\n`,
);
