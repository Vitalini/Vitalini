// Render the repository set to an SVG card and the README block. Pure: no I/O, no clock.

export const THEMES = {
  light: { bg: '#ffffff', border: '#d0d7de', chip: '#f6f8fa', text: '#1f2328', muted: '#59636e', accent: '#8250df' },
  dark: { bg: '#0d1117', border: '#30363d', chip: '#161b22', text: '#e6edf3', muted: '#9198a1', accent: '#a371f7' },
};

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;

const WIDTH = 880;
const PAD = 24;
const COLS = 3;
const GAP = 12;
const CHIP_W = (WIDTH - 2 * PAD - (COLS - 1) * GAP) / COLS; // 269.33
const CHIP_H = 44;
const GRID_TOP = 104;
const LABEL_CHARS = 26; // fits a chip at 16px (activepieces/activepieces is 25)
const TITLE = 'Open-source contributions';
const SUBTITLE = 'External repositories I contribute to';
const CARD_ALT = `${TITLE}: external repositories I contribute to`;

const xml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const truncate = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const round = (n) => Math.round(n * 100) / 100;

/** Owner and repo for a chip label, shortened from the owner side so the repo name stays whole. */
function label(r) {
  const full = `${r.owner}/${r.repo}`;
  if (full.length <= LABEL_CHARS) return [r.owner, r.repo];
  const repo = truncate(r.repo, LABEL_CHARS - 3);
  const ownerRoom = LABEL_CHARS - repo.length - 1;
  return [ownerRoom >= 2 ? truncate(r.owner, ownerRoom) : '…', repo];
}

function chip(r, i) {
  const x = round(PAD + (i % COLS) * (CHIP_W + GAP));
  const y = GRID_TOP + Math.floor(i / COLS) * (CHIP_H + GAP);
  const [owner, repo] = label(r);
  return [
    `<rect x="${x}" y="${y}" width="${round(CHIP_W)}" height="${CHIP_H}" rx="8" class="chip"/>`,
    `<circle cx="${round(x + 18)}" cy="${y + CHIP_H / 2}" r="4" class="dot"/>`,
    `<text x="${round(x + 32)}" y="${y + 27}"><tspan class="muted">${xml(owner)}/</tspan><tspan class="strong">${xml(repo)}</tspan></text>`,
  ];
}

/** The card as an SVG string for one theme. */
export function renderSvg(model, theme) {
  const t = THEMES[theme];
  const rows = Math.ceil(model.repos.length / COLS);
  const height = GRID_TOP + rows * CHIP_H + (rows - 1) * GAP + PAD;
  const title = `${TITLE}: ${model.repos.map((r) => r.name).join(', ')}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="oss-title">`,
    `<title id="oss-title">${xml(title)}</title>`,
    `<style>`,
    `text { font-family: ${SANS}; font-size: 16px; fill: ${t.text}; }`,
    `.muted { fill: ${t.muted}; }`,
    `.strong { font-weight: 600; }`,
    `.title { font-size: 22px; font-weight: 600; }`,
    `.chip { fill: ${t.chip}; stroke: ${t.border}; stroke-width: 1; }`,
    `.dot { fill: ${t.accent}; }`,
    `</style>`,
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>`,
    `<text x="${PAD}" y="50" class="title">${TITLE}</text>`,
    `<text x="${PAD}" y="78" class="muted">${SUBTITLE}</text>`,
    ...model.repos.flatMap(chip),
    `</svg>`,
    '',
  ].join('\n');
}

/** The README block between the oss markers: the card, linked to the GitHub search behind it. */
export function renderReadmeBlock(model) {
  return [
    `<a href="${model.verifyUrl}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="./generated/oss-dark.svg">`,
    `    <source media="(prefers-color-scheme: light)" srcset="./generated/oss-light.svg">`,
    `    <img alt="${CARD_ALT}" src="./generated/oss-light.svg" width="100%">`,
    `  </picture>`,
    `</a>`,
    '',
  ].join('\n');
}
