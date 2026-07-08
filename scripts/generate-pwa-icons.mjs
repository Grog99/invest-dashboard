#!/usr/bin/env node
// Generuje ikony PWA (monogram „ID”) jako statyczne assety — patrz
// docs/plans/pwa-wersja-mobilna.md, sekcja „Ikony — programowy monogram ID”.
//
// Litery rysowane jako wektorowe <path stroke> (linia + łuk Q-Beziera),
// CELOWO bez <text>/fontów: rasteryzacja tekstu przez sharp (libvips/
// librsvg) zależy od fontconfig zainstalowanego w systemie i notorycznie
// zawodzi headless / cross-platform (Windows, Docker). Ścieżki wektorowe są
// w pełni deterministyczne niezależnie od środowiska.
//
// Idempotentny — bezpiecznie uruchamiać wielokrotnie (nadpisuje pliki).
// Uruchomienie: `npm run icons`.

import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Kolory z globals.css (dark theme, baza aplikacji) — patrz „Ustalenia” w
// planie: tło monogramu = --color-accent, niezależnie od theme_color
// manifestu (ten zostaje dopasowany do UI, #0d0d0d).
const ACCENT = "#3987e5";
const WHITE = "#ffffff";

// Glif „ID” narysowany w siatce projektowej 512x512, wyśrodkowany w obu
// osiach: „I” = pojedyncza pionowa kreska (stroke, round linecap), „D” =
// pionowa kreska + łuk (dwie krzywe kwadratowe Q) tworzący brzuch litery.
// `scale` pozwala pomniejszyć cały glif wokół środka (bezpieczna strefa
// wariantu maskable).
function glyph(scale) {
  return `  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M 156 146 L 156 366" stroke="${WHITE}" stroke-width="40" stroke-linecap="round" fill="none" />
    <path d="M 256 146 L 256 366" stroke="${WHITE}" stroke-width="40" stroke-linecap="round" fill="none" />
    <path d="M 256 146 Q 356 146 356 256 Q 356 366 256 366" stroke="${WHITE}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </g>`;
}

// `radius` i `scale` żyją w przestrzeni viewBox (512), więc skalują się
// jednolicie razem z resztą rysunku niezależnie od finalnego `size` w
// pikselach — nie trzeba ich przeliczać per wariant.
function iconSvg({ size, radius, glyphScale }) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}" />
${glyph(glyphScale)}
</svg>
`;
}

const ROUNDED_RADIUS = 112; // zaokrąglony kwadrat — favicon / ikony "any"
const ANY_GLYPH_SCALE = 1;
// Maskable: tło full-bleed, BEZ zaokrągleń i przezroczystości (Android sam
// nakłada maskę), monogram pomniejszony do bezpiecznej strefy ~60% środka.
const MASKABLE_GLYPH_SCALE = 0.8;

async function renderPng(svg, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  const { size } = await stat(outPath);
  console.log(`  ${path.relative(ROOT, outPath)} (${size} B)`);
}

async function writeSvg(svg, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, svg, "utf8");
  const { size } = await stat(outPath);
  console.log(`  ${path.relative(ROOT, outPath)} (${size} B)`);
}

async function main() {
  console.log("Generowanie ikon PWA (monogram „ID”)...");

  await renderPng(
    iconSvg({ size: 192, radius: ROUNDED_RADIUS, glyphScale: ANY_GLYPH_SCALE }),
    path.join(ROOT, "public", "icon-192.png")
  );

  await renderPng(
    iconSvg({ size: 512, radius: ROUNDED_RADIUS, glyphScale: ANY_GLYPH_SCALE }),
    path.join(ROOT, "public", "icon-512.png")
  );

  await renderPng(
    iconSvg({ size: 512, radius: 0, glyphScale: MASKABLE_GLYPH_SCALE }),
    path.join(ROOT, "public", "icon-maskable-512.png")
  );

  // iOS ignoruje kanał alpha i sam zaokrągla rogi — pełne, kwadratowe tło.
  await renderPng(
    iconSvg({ size: 180, radius: 0, glyphScale: ANY_GLYPH_SCALE }),
    path.join(ROOT, "src", "app", "apple-icon.png")
  );

  // Ten sam master jako ostry favicon karty w nowoczesnych przeglądarkach
  // (Next linkuje automatycznie, sizes="any").
  await writeSvg(
    iconSvg({ size: 512, radius: ROUNDED_RADIUS, glyphScale: ANY_GLYPH_SCALE }),
    path.join(ROOT, "src", "app", "icon.svg")
  );

  console.log("Gotowe.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
