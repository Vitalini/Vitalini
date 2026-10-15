// Render the grouped PR model to SVG and Markdown. Pure: no I/O, no clock.

export const THEMES = {
  light: { bg: '#ffffff', border: '#d0d7de', text: '#1f2328', muted: '#59636e', accent: '#8250df', open: '#1a7f37' },
  dark: { bg: '#0d1117', border: '#30363d', text: '#e6edf3', muted: '#9198a1', accent: '#a371f7', open: '#3fb950' },
};

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;

const WIDTH = 880;
const PAD = 24;
const COL = 404;
const GUTTER = 24;
const LINE = 22;
const BLOCK_GAP = 16;
const TITLE_CHARS = 31; // fits the title slot between "#number" and the date at 14px
const OPEN_LINE_CHARS = 104;
const CARD_ALT = 'Merged open-source pull requests by repository (full list in the table below)';

export const headerLine = (m) =>
  `${m.merged.total} merged pull requests in ${m.merged.repoCount} ${m.merged.repoCount === 1 ? 'repository' : 'repositories'}`;

const xml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const truncate = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const date = (iso) => iso.slice(0, 10);

function blockLines(repo, cap) {
  const shown = Math.min(repo.prs.length, cap);
  return 1 + shown + (repo.prs.length > cap ? 1 : 0);
}

/** Split repo blocks into two columns; the left column takes blocks until it holds at least half the height. */
function splitColumns(repos, cap) {
  const heights = repos.map((r) => blockLines(r, cap) * LINE);
  const total = heights.reduce((a, h) => a + h + BLOCK_GAP, 0);
  let left = 0;
  let i = 0;
  while (i < repos.length && left < total / 2) left += heights[i++] + BLOCK_GAP;
  return [repos.slice(0, i), repos.slice(i)];
}

function columnSvg(repos, x, top, cap) {
  const out = [];
  let y = top;
  for (const r of repos) {
    y += LINE;
    out.push(
      `<text x="${x}" y="${y}" class="repo"><tspan class="muted">${xml(r.owner)}/</tspan><tspan class="strong">${xml(r.repo)}</tspan></text>`,
      `<text x="${x + COL}" y="${y}" class="repo accent end">${r.count} merged</text>`,
    );
    for (const p of r.prs.slice(0, cap)) {
      y += LINE;
      out.push(
        `<text x="${x}" y="${y}" class="mono">#${p.number}</text>`,
        `<text x="${x + 58}" y="${y}">${xml(truncate(p.title, TITLE_CHARS))}</text>`,
        `<text x="${x + COL}" y="${y}" class="mono muted end">${date(p.mergedAt)}</text>`,
      );
    }
    if (r.prs.length > cap) {
      y += LINE;
      out.push(`<text x="${x}" y="${y}" class="muted">+${r.prs.length - cap} more</text>`);
    }
    y += BLOCK_GAP;
  }
  return { svg: out, bottom: y - BLOCK_GAP };
}

function wrapOpen(items) {
  const labels = items.map((i) => `${i.repo} #${i.number}`);
  const lines = [];
  let line = [];
  let len = 'In review  '.length;
  for (const l of labels) {
    if (line.length && len + l.length + 3 > OPEN_LINE_CHARS) {
      lines.push(line);
      line = [];
      len = 0;
    }
    line.push(l);
    len += l.length + 3;
  }
  if (line.length) lines.push(line);
  return lines.map((l) => l.join(' · '));
}

/** The card as an SVG string for one theme. */
export function renderSvg(model, theme, cap) {
  const t = THEMES[theme];
  const header = headerLine(model);
  const rest = header.slice(String(model.merged.total).length);
  const top = 110;
  const [leftRepos, rightRepos] = splitColumns(model.merged.repos, cap);
  const left = columnSvg(leftRepos, PAD, top, cap);
  const right = columnSvg(rightRepos, PAD + COL + GUTTER, top, cap);
  const body = [...left.svg, ...right.svg];
  let y = Math.max(left.bottom, right.bottom);

  const openLines = wrapOpen(model.open.items);
  if (openLines.length) {
    y += 20;
    body.push(`<line x1="${PAD}" y1="${y}" x2="${WIDTH - PAD}" y2="${y}" class="rule"/>`);
    y += 10;
    openLines.forEach((l, n) => {
      y += LINE;
      const label = n === 0 ? `<tspan class="open strong">In review</tspan>  ` : '';
      body.push(`<text x="${PAD}" y="${y}" xml:space="preserve">${label}<tspan class="muted">${xml(l)}</tspan></text>`);
    });
  }
  const height = y + PAD;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="oss-title">`,
    `<title id="oss-title">${xml(header)}</title>`,
    `<style>`,
    `text { font-family: ${SANS}; font-size: 14px; fill: ${t.text}; }`,
    `.mono { font-family: ${MONO}; }`,
    `.muted { fill: ${t.muted}; }`,
    `.strong { font-weight: 600; }`,
    `.accent { fill: ${t.accent}; }`,
    `.open { fill: ${t.open}; }`,
    `.repo { font-size: 15px; }`,
    `.end { text-anchor: end; }`,
    `.count { font-size: 32px; font-weight: 600; fill: ${t.accent}; }`,
    `.lead { font-size: 18px; }`,
    `.rule { stroke: ${t.border}; stroke-width: 1; }`,
    `</style>`,
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>`,
    `<text x="${PAD}" y="58"><tspan class="count">${model.merged.total}</tspan><tspan class="lead">${xml(rest)}</tspan></text>`,
    `<text x="${PAD}" y="84" class="muted">External contributions, excluding employer and own repositories</text>`,
    ...body,
    `</svg>`,
    '',
  ].join('\n');
}

/** Escape text for a Markdown link title inside a table cell. */
const mdTitle = (s) =>
  s.replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '\\"').replace(/\|/g, '\\|');

const prLink = (label, p) => `[${label}](${p.url} "${mdTitle(p.title)}")`;

/** The README block between the oss markers: linked card plus a per-repository table. */
export function renderReadmeBlock(model) {
  const rows = model.merged.repos.map(
    (r) => `| [${r.name}](${r.url}) | ${r.prs.map((p) => prLink(`#${p.number}`, p)).join(' · ')} | ${r.count} |`,
  );
  if (model.open.items.length) {
    rows.push(`| In review | ${model.open.items.map((i) => prLink(`${i.repo} #${i.number}`, i)).join(' · ')} | ${model.open.items.length} |`);
  }
  return [
    `<a href="${model.verifyUrl}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="./generated/oss-dark.svg">`,
    `    <source media="(prefers-color-scheme: light)" srcset="./generated/oss-light.svg">`,
    `    <img alt="${CARD_ALT}" src="./generated/oss-light.svg" width="100%">`,
    `  </picture>`,
    `</a>`,
    '',
    `| Repository | Pull requests | Count |`,
    `|---|---|---|`,
    ...rows,
    '',
  ].join('\n');
}
