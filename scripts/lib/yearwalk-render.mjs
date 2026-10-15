// Render the Year Walk landscape to an animated SVG string. Pure: same model + theme + bucket -> same bytes.
//
// Timing: the terrain rises first (RISE s). From WALK_BEGIN on, the walker and every challenge share
// one loop of `route.loop` seconds (`dur` = loop, `repeatCount="indefinite"`); WHEN something happens
// inside the loop is encoded in keyTimes, so a challenge's action and the walker's pause line up.

import { caption, monthName, tooltip } from './calendar.mjs';
import { K, WALK_BEGIN, challengeSvg, mix, n, timed, walkerPoses } from './yearwalk-sprites.mjs';
import { BASE, HEIGHT, H_MAX, WIDTH, X0, layoutTerrain, placeChallenges, poseOf, walkerRoute } from './yearwalk-terrain.mjs';

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
export const RISE = 2.4; // seconds, the terrain rise wave
export { WALK_BEGIN };
export const STEP_DUR = 1.2; // seconds, one walk cycle: two frames of 0.6 s
export const CLIMB_DUR = 1; // seconds, one climb cycle: two frames of 0.5 s

export const THEMES = {
  light: {
    ramp: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
    bg: '#ffffff', sky0: '#d4eafb', sky1: '#ffffff', grass: '#40c463', soil: '#d8b994',
    tick: '#d0d7de', label: '#57606a', text: '#1f2328', pole: '#57606a', flag: '#cf222e', snow: '#ffffff', snowSh: '#dbe7f0',
    shirt: '#0969da', pants: '#24292f', hair: '#4a3428', skin: '#e8b07d',
    gear: '#8c6d4f', water: '#8cc8ec', rock: '#8c959f', rockSh: '#6e7781', cat: '#f0a35e', catSh: '#c97a3a', bird: '#3d6fb6', cloud: '#ffffff', tool: '#57606a',
  },
  dark: {
    ramp: ['#0e4429', '#006d32', '#26a641', '#39d353'],
    bg: '#0d1117', sky0: '#0d1117', sky1: '#132a45', grass: '#26a641', soil: '#3a2c20',
    tick: '#30363d', label: '#8b949e', text: '#e6edf3', pole: '#c9d1d9', flag: '#f85149', snow: '#e6edf3', snowSh: '#aab6c2',
    shirt: '#58a6ff', pants: '#8b949e', hair: '#d29922', skin: '#f1c27d',
    gear: '#8b949e', water: '#3a6d96', rock: '#6e7681', rockSh: '#484f58', cat: '#d18b4e', catSh: '#9c6331', bird: '#79c0ff', cloud: '#ffffff', tool: '#c9d1d9',
  },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ramp color at t in [0, 1], linear between stops. */
export function rampColor(ramp, t) {
  const p = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(p));
  return mix(ramp[i], ramp[i + 1], p - i);
}

/** Everything the renderer and the tests need, without SVG. */
export function scene(model, bucket = 'week') {
  const terrain = layoutTerrain(model, bucket);
  const challenges = placeChallenges(model, terrain);
  const route = walkerRoute(model, terrain, challenges);
  const peakIndex = terrain.buckets.reduce((a, b, i, all) => (b.sum > all[a].sum ? i : a), 0);
  return { terrain, challenges, route, peakIndex };
}

function prng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function renderYearWalk(model, themeName, bucket = 'week') {
  const C = THEMES[themeName];
  if (!C) throw new Error(`unknown theme ${themeName}`);
  const dark = themeName === 'dark';
  const { terrain, challenges, route, peakIndex } = scene(model, bucket);
  const { buckets, transitions, xOf } = terrain;
  const { segs, loop } = route;
  const days = model.weeks.flat();
  const right = buckets.at(-1).x1;
  const ctx = { loop, terrain, model, route };

  // Month spans in pixels, for labels, ticks and the seasonal sky props.
  const months = [];
  days.forEach((d, i) => {
    const m = d.date.slice(0, 7);
    if (months.at(-1)?.m === m) months.at(-1).end = i + 1;
    else months.push({ m, date: d.date, start: i, end: i + 1 });
  });
  for (const m of months) {
    m.x0 = xOf(m.start);
    m.x1 = xOf(m.end);
    const mo = Number(m.date.slice(5, 7));
    m.season = mo === 12 || mo <= 2 ? 'winter' : mo <= 5 ? 'spring' : mo <= 8 ? 'summer' : 'autumn';
  }
  const inSeason = (s) => months.filter((m) => m.season === s);

  const poses = walkerPoses(C);
  const defs = [
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky0}"/><stop offset="1" stop-color="${C.sky1}"/></linearGradient>`,
    `<g id="cl"><ellipse cx="11" cy="5" rx="11" ry="3.4" fill="${C.cloud}"/><circle cx="8" cy="3" r="4" fill="${C.cloud}"/><circle cx="14" cy="2" r="5" fill="${C.cloud}"/></g>`,
    `<circle id="fl" r="1.1" fill="${C.snow}"/>`,
    `<ellipse id="pt" rx="1.3" ry=".7" fill="#f4a6c1"/>`,
    `<ellipse id="lf" rx="1.4" ry=".7" fill="#e08a2e"/>`,
    ...Object.entries(poses).map(([k, v]) => `<g id="p-${k}"><g transform="scale(${K})">${v}</g></g>`),
  ];

  const out = [];
  // ---------- sky ----------
  out.push(`<rect width="${WIDTH}" height="${BASE}" fill="url(#sky)"/>`);
  const summer = inSeason('summer');
  const sunX = summer.length ? n((summer[0].x0 + summer.at(-1).x1) / 2) : WIDTH / 2;
  if (dark) {
    const rnd = prng(11);
    let st = '';
    for (let k = 0; k < 70; k++) {
      const x = n(X0 + rnd() * (right - X0));
      const y = n(6 + rnd() * 120);
      const big = rnd() < 0.15;
      const tw = k % 4 === 0
        ? `<animate attributeName="opacity" values="1;.2;1" keyTimes="0;.5;1" dur="${(2.5 + rnd() * 3).toFixed(1)}s" begin="${(rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
        : '';
      st += `<circle cx="${x}" cy="${y}" r="${big ? 1 : 0.6}" fill="#e6edf3" opacity="${big ? 0.9 : 0.55}">${tw}</circle>`;
    }
    out.push(`<g class="fx">${st}</g>`);
    out.push(`<path transform="translate(${sunX} 40)" d="M2 -7.5A7.5 7.5 0 1 0 2 7.5A5.8 5.8 0 1 1 2 -7.5Z" fill="#f0e6c0"/>`);
  } else {
    out.push(`<g transform="translate(${sunX} 44)"><circle r="12" fill="#f4c430" opacity=".18"/><circle r="7" fill="#f4c430"/><path d="M-7 0a7 7 0 0 1 7 -7v7z" fill="#fbe38a" opacity=".6"/></g>`);
    const rnd = prng(5);
    const layer = (count, yMin, yMax, sc, op, dur) => {
      let c = '';
      for (let k = 0; k < count; k++) {
        const x = Math.round((k * WIDTH) / count + rnd() * 60);
        const y = Math.round(yMin + rnd() * (yMax - yMin));
        c += `<use href="#cl" transform="translate(${x} ${y}) scale(${sc})"/><use href="#cl" transform="translate(${x - WIDTH} ${y}) scale(${sc})"/>`;
      }
      return `<g opacity="${op}" class="fx"><animateTransform attributeName="transform" type="translate" values="0 0;${WIDTH} 0" keyTimes="0;1" dur="${dur}s" repeatCount="indefinite"/>${c}</g>`;
    };
    out.push(layer(4, 70, 110, 1, 0.6, 240));
    out.push(layer(5, 14, 60, 1.6, 0.95, 150));
  }
  // Snow (Dec–Feb), blossom petals (Mar–May) and leaves (Sep–Nov) drift down over their own months.
  const rnd = prng(23);
  const fall = (s, id, perMonth, drift) => {
    let f = '';
    for (const m of inSeason(s)) {
      for (let k = 0; k < perMonth; k++) {
        const x = n(m.x0 + rnd() * (m.x1 - m.x0));
        const y = n(30 + rnd() * 80);
        const du = (6 + rnd() * 5).toFixed(1);
        const b = (rnd() * 6).toFixed(1);
        f += `<use href="#${id}" x="${x}" y="${y}"><animateTransform attributeName="transform" type="translate" values="0 -20;${drift} 40" keyTimes="0;1" dur="${du}s" begin="-${b}s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.15;.8;1" dur="${du}s" begin="-${b}s" repeatCount="indefinite"/></use>`;
      }
    }
    return f;
  };
  out.push(`<g class="fx">${fall('winter', 'fl', 3, 4)}${fall('spring', 'pt', 2, 8)}${fall('autumn', 'lf', 2, 10)}</g>`);

  // ---------- ground ----------
  out.push(`<rect x="${X0}" y="${BASE}" width="${n(right - X0)}" height="2.5" fill="${C.grass}"/><rect x="${X0}" y="${BASE + 2.5}" width="${n(right - X0)}" height="5" rx="1" fill="${C.soil}"/>`);
  out.push(`<g fill="${C.tick}">${months.slice(1).map((m) => `<rect x="${m.x0}" y="${BASE + 10}" width="1" height="4"/>`).join('')}</g>`);

  // ---------- terrain: one rising plateau per bucket, rounded where it stands above a neighbour ----------
  const terr = [];
  buckets.forEach((b, i) => {
    if (b.h === 0) return;
    const lh = buckets[i - 1]?.h ?? 0;
    const rh = buckets[i + 1]?.h ?? 0;
    const rl = lh < b.h ? Math.min(2.5, b.h - lh) : 0;
    const rr = rh < b.h ? Math.min(2.5, b.h - rh) : 0;
    const x0 = b.x0;
    const x1 = n(b.x1 + (rr ? 0 : 0.4)); // overlap the seam with a taller right neighbour
    const top = `M${x0} ${-b.h + rl}Q${x0} ${-b.h} ${n(x0 + rl)} ${-b.h}H${n(x1 - rr)}Q${x1} ${-b.h} ${x1} ${-b.h + rr}`;
    const fill = rampColor(C.ramp, b.t);
    const edge = mix(fill, '#000000', dark ? 0.35 : 0.22);
    const delay = 0.1 + 1.5 * ((b.x0 - X0) / (right - X0));
    const a = (delay / RISE).toFixed(3);
    const e = (Math.min(RISE, delay + 0.7) / RISE).toFixed(3);
    terr.push(
      `<g class="r"><animateTransform attributeName="transform" type="scale" values="1 0;1 0;1 1;1 1" keyTimes="0;${a};${e};1" dur="${RISE}s" fill="freeze"/>` +
        `<path d="${top}V0H${x0}Z" fill="${fill}"/><path d="${top}" fill="none" stroke="${edge}" stroke-width="1.2"/></g>`,
    );
  });
  out.push(`<g transform="translate(0 ${BASE})">${terr.join('\n')}</g>`);

  // ---------- props: ladders and ropes, challenges. They fade in after the rise ----------
  const props = [];
  for (const t of transitions) {
    const yl = BASE - t.low;
    const yh = BASE - t.high;
    const s = t.up ? -1 : 1; // which side of the wall the prop is on
    if (t.kind === 'ladder') {
      const ra = n(t.x + s * 0.8);
      const rb = n(t.x + s * 4.4);
      let d = `M${ra} ${yl}V${yh - 1.5}M${rb} ${yl}V${yh - 1.5}`;
      for (let y = yl - 2.4; y > yh - 1; y -= 2.6) d += `M${Math.min(ra, rb)} ${n(y)}H${Math.max(ra, rb)}`;
      props.push(`<path d="${d}" stroke="${C.gear}" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".85"/>`);
    } else {
      const x = n(t.x + s * 1.2);
      const peg = n(t.x - s * 0.6);
      // Sways only while he is on it.
      const sway = [[t.t0, `0 ${x} ${yh}`]];
      for (let u = t.t0 + 0.25, k = 0; u < t.t1; u += 0.5, k++) sway.push([u, `${k % 2 ? -2.5 : 2.5} ${x} ${yh}`]);
      sway.push([t.t1 + 0.25, `0 ${x} ${yh}`]);
      props.push(
        `<g class="act">${timed(loop, sway, { type: 'rotate' })}<path d="M${peg} ${yh}H${x}V${n(yl - 1)}" stroke="${C.gear}" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".7"/></g>`,
      );
    }
  }
  for (const c of challenges) props.push(challengeSvg(C, c, ctx));
  out.push(`<g class="fd"><animate attributeName="opacity" values="0;0;1" keyTimes="0;${(RISE / WALK_BEGIN).toFixed(3)};1" dur="${WALK_BEGIN}s" fill="freeze"/>${props.join('\n')}</g>`);

  // ---------- walker: piecewise linear motion with explicit keyTimes, one pose group per pose ----------
  const vals = [segs[0].from, ...segs.map((s) => s.to)].map(([x, y]) => `${n(x)},${n(y)}`).join(';');
  const kts = [0];
  for (const s of segs) kts.push(Math.max(kts.at(-1), Number((s.t1 / loop).toFixed(5))));
  kts[kts.length - 1] = 1;
  const poseAnim = (pose) => {
    const ch = [];
    for (const s of segs) {
      const v = poseOf(s.mode) === pose ? 1 : 0;
      if (!ch.length || ch.at(-1)[1] !== v) ch.push([s.t0, v]);
    }
    ch[0][0] = 0;
    return { first: ch[0][1], anim: timed(loop, ch, { attr: 'opacity', calc: 'discrete' }) };
  };
  const cycle = (a, dur) => `<animate attributeName="opacity" values="${a ? '1;0;1' : '0;1;0'}" keyTimes="0;.5;1" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`;
  const used = [...new Set(segs.map((s) => poseOf(s.mode)))];
  const groups = used.map((p) => {
    const { first, anim } = poseAnim(p);
    const body = p === 'walk'
      ? `<use href="#p-walkA">${cycle(true, STEP_DUR)}</use><use href="#p-walkB" opacity="0">${cycle(false, STEP_DUR)}</use>`
      : p === 'climb'
        ? `<use href="#p-climbA">${cycle(true, CLIMB_DUR)}</use><use href="#p-climbB" opacity="0">${cycle(false, CLIMB_DUR)}</use>`
        : `<use href="#p-${p}"/>`;
    return `<g opacity="${first}">${anim}${body}</g>`;
  });
  const [sx, sy] = segs[0].from;
  out.push(
    `<g class="wk"><animate attributeName="opacity" values="0;0;1" keyTimes="0;.9;1" dur="${WALK_BEGIN}s" fill="freeze"/><g transform="translate(${X0} ${BASE})"><g>` +
      `<animateMotion values="${vals}" keyTimes="${kts.join(';')}" calcMode="linear" dur="${n(loop)}s" begin="${WALK_BEGIN}s" repeatCount="indefinite"/>` +
      groups.join('') +
      `</g></g></g>`,
    `<use class="wk0" href="#p-walkA" x="${n(X0 + sx)}" y="${n(BASE + sy)}"/>`,
  );

  // ---------- labels, caption, hover columns ----------
  const labels = months
    .filter((m) => m.x1 - m.x0 >= 24)
    .map((m) => `<text x="${n((m.x0 + m.x1) / 2)}" y="${BASE + 25}" text-anchor="middle">${monthName(m.date)}</text>`)
    .join('');
  const top = BASE - H_MAX - 30;
  const hover = buckets
    .map((b) => `<rect x="${b.x0}" y="${top}" width="${n(b.x1 - b.x0)}" height="${BASE + 8 - top}"><title>${tooltip(b.sum, b.first, b.last)}</title></rect>`)
    .join('\n');

  const pk = buckets[peakIndex];
  const unit = { day: 'day', week: 'week', halfmonth: 'half-month', month: 'month' }[bucket];
  const title = `${model.name}'s GitHub contributions as a landscape: ${caption(model)}`;
  const desc =
    `One plateau per ${unit}, ${buckets.length} plateaus from left to right. Plateau height is the square root of its total, ` +
    `capped at ${terrain.cap.toLocaleString('en-US')} contributions (the 99th percentile of the totals); empty ${unit}s stay on the ground. ` +
    `A walker crosses the year in a ${Math.round(loop)}-second loop, climbing ladders and ropes between plateaus, with a different challenge on every ${unit}: ` +
    `he saws trees and pushes boulders on the busiest ones, and plants a flag by the campfire on the busiest` + (pk.sum ? `: ${tooltip(pk.sum, pk.first, pk.last)}.` : '.');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="yw-title yw-desc">
<title id="yw-title">${esc(title)}</title>
<desc id="yw-desc">${esc(desc)}</desc>
<style>
text{font-family:${FONT};font-size:11px;fill:${C.label}}
.cap{font-size:13px;font-weight:600;fill:${C.text}}
.wk0{display:none}
@media (prefers-reduced-motion: reduce){.r,.act{transform:none!important}.act,.fd{opacity:1!important}.flg{opacity:0!important}.wk,.fx{display:none}.wk0{display:inline}}
</style>
<defs>${defs.join('')}</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${C.bg}"/>
${out.join('\n')}
${labels}
<text x="${X0}" y="${HEIGHT - 14}" class="cap">${esc(caption(model))}</text>
<g fill="#000000" fill-opacity="0">
${hover}
</g>
</svg>
`;
}
