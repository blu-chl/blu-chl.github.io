'use strict';

/* ═══════════════ 0. UTILIDADES ═══════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY = 864e5;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function svgText(parent, x, y, str, cls, anchor = 'start') {
  const t = svgEl('text', { x, y, 'text-anchor': anchor }, parent);
  if (cls) t.setAttribute('class', cls);
  t.textContent = str;
  return t;
}

const nfCache = {};
function num(v, d = 0) {
  if (!nfCache[d]) nfCache[d] = new Intl.NumberFormat('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
  return nfCache[d].format(v);
}
const money = (v, d = 0, pre = '$') => (v < 0 ? '−' : '') + pre + num(Math.abs(v), d);
const mm = (v, d = 1) => (v < 0 ? '−' : '') + 'MM$ ' + num(Math.abs(v), d);
const fmtDate = (t, year = true) => { const d = new Date(t); return d.getDate() + ' ' + MES[d.getMonth()] + (year ? ' ' + d.getFullYear() : ''); };

function linear(d0, d1, r0, r1) {
  const k = (r1 - r0) / ((d1 - d0) || 1);
  const f = v => r0 + (v - d0) * k;
  f.invert = p => d0 + (p - r0) / k;
  return f;
}

// ticks "redondos" (0 / 5 / 10 …) que siempre contienen [min, max]
function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}

function nearest(arr, v) {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid; else hi = mid; }
  return (v - arr[lo] <= arr[hi] - v) ? lo : hi;
}

// columna con el extremo de datos redondeado y la base recta; h con signo
function colPath(x, y, w, h, r = 4) {
  const up = h < 0, top = up ? y + h : y, bot = up ? y : y + h;
  r = Math.min(r, w / 2, Math.abs(h));
  return up
    ? `M${x},${bot}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${top + r}V${bot}Z`
    : `M${x},${top}V${bot - r}A${r},${r} 0 0 0 ${x + r},${bot}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${bot - r}V${top}Z`;
}

function localPoint(svg, e) {
  const r = svg.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function freshSvg(container, w, h, label) {
  container.replaceChildren();
  const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img' }, container);
  if (label) svg.setAttribute('aria-label', label);
  return svg;
}

// cada gráfico se redibuja solo cuando cambia el ancho de su contenedor
function mount(container, draw) {
  const m = { w: 0, redraw() { if (m.w) draw(container, m.w); } };
  new ResizeObserver(([entry]) => {
    const w = Math.floor(entry.contentRect.width);
    if (w > 0 && w !== m.w) { m.w = w; draw(container, w); }
  }).observe(container);
  return m;
}

/* tooltip único — todo el contenido entra con textContent */
const tip = {
  el: null,
  show(x, y, { title, rows = [], desc }) {
    const el = this.el || (this.el = $('#tip'));
    el.replaceChildren();
    if (title) { const t = document.createElement('div'); t.className = 'tip-title'; t.textContent = title; el.appendChild(t); }
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      if (r.color) { const i = document.createElement('i'); i.style.background = r.color; row.appendChild(i); }
      const b = document.createElement('b'); b.textContent = r.value; row.appendChild(b);
      if (r.label) { const s = document.createElement('span'); s.textContent = r.label; row.appendChild(s); }
      el.appendChild(row);
    });
    if (desc) { const d = document.createElement('div'); d.className = 'tip-desc'; d.textContent = desc; el.appendChild(d); }
    el.classList.add('on');
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x + 16, top = y + 16;
    if (left + w > innerWidth - 8) left = x - w - 16;
    if (top + h > innerHeight - 8) top = y - h - 16;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, top) + 'px';
  },
  hide() { if (this.el) this.el.classList.remove('on'); }
};
addEventListener('scroll', () => tip.hide(), { passive: true });

function timeTicks(t0, t1, max = 6) {
  const out = [];
  const days = (t1 - t0) / DAY;
  if (days <= 45) {
    const d = new Date(t0);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= t1; d.setDate(d.getDate() + 7)) out.push({ t: d.getTime(), label: d.getDate() + ' ' + MES[d.getMonth()] });
    return out;
  }
  const step = Math.max(1, Math.ceil(days / 30.4 / max));
  const s = new Date(t0);
  for (const d = new Date(s.getFullYear(), s.getMonth() + 1, 1); d.getTime() <= t1; d.setMonth(d.getMonth() + step)) {
    out.push({ t: d.getTime(), label: d.getMonth() === 0 ? String(d.getFullYear()) : MES[d.getMonth()] });
  }
  return out;
}

function deltaInfo(cur, prev) {
  const diff = cur - prev;
  const dir = Math.abs(diff) < 1e-9 ? 0 : Math.sign(diff);
  return { diff, dir, pct: prev ? diff / prev * 100 : 0, cls: dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat', arrow: dir > 0 ? '▲' : dir < 0 ? '▼' : '=' };
}

/* línea genérica con crosshair (dólar en la terminal) */
function drawLine(container, w, o) {
  const pts = o.pts || [];
  const h = o.h;
  const m = { t: 18, r: 14, b: 28, l: 54 };
  const svg = freshSvg(container, w, h, o.label);
  if (pts.length < 2) return;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = linear(t0, t1, m.l, w - m.r);
  let lo = Infinity, hi = -Infinity;
  pts.forEach(p => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
  const ticks = niceTicks(lo, hi, 4);
  const y = linear(ticks[0], ticks[ticks.length - 1], h - m.b, m.t);
  const base = h - m.b;

  const g = svgEl('g', { class: 'ax' }, svg);
  ticks.forEach(v => {
    svgEl('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v), class: 'grid-line' }, g);
    svgText(g, m.l - 8, y(v) + 3.5, num(v), null, 'end');
  });
  timeTicks(t0, t1, w < 520 ? 4 : 6).forEach(tk => {
    svgEl('line', { x1: x(tk.t), x2: x(tk.t), y1: base, y2: base + 4, class: 'base-line' }, g);
    svgText(g, x(tk.t), base + 17, tk.label, null, 'middle');
  });
  svgEl('line', { x1: m.l, x2: w - m.r, y1: base, y2: base, class: 'base-line' }, g);

  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
  svgEl('path', { d: `${d}L${x(t1).toFixed(1)},${base}L${x(t0).toFixed(1)},${base}Z`, class: 'area-c1' }, svg);
  svgEl('path', { d, class: 'ln ln-c1' }, svg);

  let iMax = 0, iMin = 0;
  pts.forEach((p, i) => { if (p.v > pts[iMax].v) iMax = i; if (p.v < pts[iMin].v) iMin = i; });
  [[iMax, -11, 'máx '], [iMin, 19, 'mín ']].forEach(([i, dy, tag]) => {
    const px = x(pts[i].t), py = y(pts[i].v);
    svgEl('circle', { cx: px, cy: py, r: 4, class: 'dot dot-c1' }, svg);
    const anchor = px < m.l + 70 ? 'start' : px > w - m.r - 70 ? 'end' : 'middle';
    svgText(svg, px, py + dy, tag + o.fmt(pts[i].v), 'note-label', anchor);
  });

  const xh = svgEl('line', { class: 'xhair', y1: m.t, y2: base, visibility: 'hidden' }, svg);
  const hd = svgEl('circle', { r: 4.5, class: 'dot dot-c1', visibility: 'hidden' }, svg);
  const hit = svgEl('rect', { x: 0, y: 0, width: w, height: h, class: 'hit' }, svg);
  const ts = pts.map(p => p.t);
  const move = e => {
    const [px] = localPoint(svg, e);
    const p = pts[nearest(ts, x.invert(px))];
    xh.setAttribute('x1', x(p.t)); xh.setAttribute('x2', x(p.t)); xh.setAttribute('visibility', 'visible');
    hd.setAttribute('cx', x(p.t)); hd.setAttribute('cy', y(p.v)); hd.setAttribute('visibility', 'visible');
    const ch = (p.v / pts[0].v - 1) * 100;
    tip.show(e.clientX, e.clientY, {
      title: fmtDate(p.t),
      rows: [{ color: 'var(--c1)', value: o.fmt(p.v), label: o.name }],
      desc: p === pts[0] ? null : (ch >= 0 ? '▲ ' : '▼ ') + num(Math.abs(ch), 2) + '% desde el ' + fmtDate(pts[0].t)
    });
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); tip.hide(); });
}


/* ═══════════════ 1. PRELOADER ═══════════════ */
(function preloader() {
  const loader = $('#loader'), bar = $('#loadBar');
  let v = 0;
  const tick = setInterval(() => {
    v += Math.random() * 18 + 8;
    if (v >= 100) { v = 100; clearInterval(tick); setTimeout(finish, 200); }
    bar.style.right = (100 - Math.floor(v)) + '%';
  }, 90);

  function finish() {
    loader.classList.add('done');
    revealHero();
  }
})();


/* ═══════════════ 2. HERO ═══════════════ */
function revealHero() {
  // letras con retraso escalonado; cada palabra va envuelta para que no se corte a mitad
  const nameEl = $('#heroName');
  const words = nameEl.textContent.trim().split(/\s+/);
  nameEl.textContent = '';
  nameEl.setAttribute('aria-label', words.join(' '));
  let i = 0;
  words.forEach((w, wi) => {
    const ws = document.createElement('span');
    ws.className = 'w';
    ws.setAttribute('aria-hidden', 'true');
    [...w].forEach(c => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      s.style.transitionDelay = (i++ * 28) + 'ms';
      ws.appendChild(s);
    });
    nameEl.appendChild(ws);
    if (wi < words.length - 1) { nameEl.appendChild(document.createTextNode(' ')); i++; }
  });

  requestAnimationFrame(() => {
    nameEl.classList.add('in');
    $$('#hero .rv').forEach((el, k) => {
      el.style.transitionDelay = (120 + k * 100) + 'ms';
      el.classList.add('in');
    });
  });
}


/* ═══════════════ 3. BOTONES MAGNÉTICOS ═══════════════ */
$$('.hero-cta .btn').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const r = btn.getBoundingClientRect();
    btn.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.22}px, ${(e.clientY - (r.top + r.height / 2)) * 0.28}px)`;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transition = 'transform 600ms cubic-bezier(0.16,1,0.3,1), background 300ms, color 300ms, border-color 300ms';
    btn.style.transform = '';
    setTimeout(() => { btn.style.transition = ''; }, 600);
  });
});


/* ═══════════════ 4. TRAYECTORIA (datos) ═══════════════ */
// Para agregar un trabajo nuevo basta con sumar una entrada aquí (fin: null = "a la fecha").
const TRAYECTORIA = [
  { id: 'umayor', fila: 0, pais: 'chile', tipo: 'Pregrado', mini: 'U. Mayor', corto: 'Universidad Mayor',
    titulo: 'Ingeniería Comercial', org: 'Universidad Mayor, Temuco',
    inicio: [2020, 3], fin: [2025, 12], periodo: '2020 — 2025',
    desc: 'Diploma de Alto Honor Académico, promedio 6,2 / 7,0. Análisis financiero, evaluación de inversiones y valoración de activos.',
    logo: { src: 'assets/logos/umayor.webp', alt: 'Universidad Mayor', tono: 'logo-dark' } },
  { id: 'agrotop', fila: 2, pais: 'chile', tipo: 'Práctica', laboral: true, mini: 'Agrotop', corto: 'Agrotop',
    titulo: 'Práctica en Gestión Comercial y Finanzas', org: 'Agrotop, Padre Las Casas',
    inicio: [2021, 12], fin: [2022, 3], periodo: 'Dic. 2021 — Mar. 2022',
    desc: 'Apoyé el cierre de 2 a 3 contratos agrícolas diarios sobre $1 millón, elaborando las liquidaciones para gerencia. Controlé los pagos a una cartera amplia de proveedores de La Araucanía y llevé el registro contable con trazabilidad para auditorías.',
    logo: { src: 'assets/logos/agrotop.png', alt: 'Agrotop', tono: 'logo-white' } },
  { id: 'vives', fila: 1, pais: 'belgica', tipo: 'Intercambio', mini: 'Vives', corto: 'Hogeschool VIVES',
    titulo: 'Intercambio académico', org: 'Hogeschool VIVES, Bélgica',
    inicio: [2023, 9], fin: [2024, 1], periodo: 'Sep. 2023 — Ene. 2024',
    desc: 'Marketing internacional, economía social, decisiones con IA y finanzas aplicadas, todo en inglés.',
    logo: { src: 'assets/logos/vives.png', alt: 'Hogeschool VIVES' } },
  { id: 'charleston', fila: 3, pais: 'eeuu', tipo: 'Work & Travel', laboral: true, mini: 'Charleston', corto: 'Charleston Place',
    titulo: 'Work & Travel · Steward', org: 'The Charleston Place, Carolina del Sur',
    inicio: [2022, 12], fin: [2023, 3], periodo: 'Dic. 2022 — Mar. 2023',
    desc: 'Mi primera temporada de Work & Travel: steward en la cocina de un hotel cinco estrellas. Trabajar todo en inglés y con gente de todo el mundo fue lo que más me dejó.',
    logo: { src: 'assets/logos/charleston-place.svg', alt: 'The Charleston Place', tono: 'logo-dark' } },
  { id: 'agrifor', fila: 2, pais: 'chile', tipo: 'Práctica', laboral: true, mini: 'Agrifor', corto: 'Agrifor',
    titulo: 'Práctica en Finanzas, RRHH y Contabilidad', org: 'Agrifor, Temuco',
    inicio: [2024, 8], fin: [2024, 11], periodo: 'Ago. — Nov. 2024',
    desc: 'Rediseñé la planificación de turnos de 150 personas (+100 % de cobertura) y apoyé conciliación y cierre mensual.',
    logoTexto: 'Agrifor' },
  { id: 'alaska', fila: 3, pais: 'eeuu', tipo: 'Work & Travel', laboral: true, mini: 'Coast Pizza', corto: 'Coast Pizza',
    titulo: 'Work & Travel · Line cook', org: 'Coast Pizza, Girdwood, Alaska',
    inicio: [2024, 12], fin: [2025, 3], periodo: 'Dic. 2024 — Mar. 2025',
    desc: 'Segunda temporada en EE.UU.: cocinero de línea en una pizzería de temporada alta, todo en inglés.',
    logo: { src: 'assets/logos/coast-pizza.png', alt: 'Coast Pizza' } },
  { id: 'independiente', fila: 4, pais: 'chile', tipo: 'Independiente', mini: 'Independiente', corto: 'Clases particulares y Uber',
    titulo: 'Profesor particular y conductor de Uber', org: 'Trabajo independiente, Temuco',
    inicio: [2025, 4], fin: [2026, 7], periodo: '2025 — 2026',
    desc: 'Año de transición: rendí mi examen de grado, di clases particulares de microeconomía, macroeconomía, contabilidad y finanzas, y trabajé como conductor de Uber. En paralelo me certifiqué en análisis de datos (Google), Power BI, Excel y freeCodeCamp.',
    logoTexto: 'Independiente' },
  { id: 'maestranza', fila: 5, pais: 'chile', tipo: 'Empleo', laboral: true, mini: 'Maestranza HHH', corto: 'Maestranza HHH',
    titulo: 'Administrativo Contable', org: 'Maestranza HHH',
    inicio: [2026, 8], fin: null, periodo: 'Ago. 2026 — hoy',
    desc: 'Conciliaciones bancarias, cuentas por pagar y por cobrar, y flujo de caja. Automatizo procesos contables con Python y BigQuery.',
    logoTexto: 'Maestranza HHH' }
];

const FILAS = ['Pregrado', 'Intercambio', 'Prácticas', 'Work & Travel', 'Independiente', 'Empleo'];
const PAISES = {
  chile: { nombre: 'Chile', color: 'var(--c1)' },
  belgica: { nombre: 'Bélgica', color: 'var(--c2)' },
  eeuu: { nombre: 'EE.UU.', color: 'var(--c3)' }
};

const NOW = new Date();
const mIdx = (y, m) => y * 12 + (m - 1);
const TODAY_M = mIdx(NOW.getFullYear(), NOW.getMonth() + 1);
const mLabel = i => MES[((Math.floor(i) % 12) + 12) % 12] + ' ' + Math.floor(Math.floor(i) / 12);

TRAYECTORIA.forEach(it => {
  it.s = mIdx(...it.inicio);
  it.e = it.fin ? mIdx(...it.fin) + 1 : TODAY_M + 1; // fin exclusivo
  it.meses = it.e - it.s;
});

const D0 = mIdx(2020, 1);
const laboralAt = m => TRAYECTORIA.reduce((n, it) => n + (it.laboral && m >= it.s && m < it.e ? 1 : 0), 0);
const CUM = [];
for (let m = D0, acc = 0; m <= TODAY_M + 1; m++) { CUM.push(acc); acc += laboralAt(m); }
const cumAt = m => {
  const i = Math.max(0, Math.min(CUM.length - 1, m - D0));
  const a = CUM[Math.floor(i)], b = CUM[Math.min(CUM.length - 1, Math.ceil(i))];
  return a + (b - a) * (i - Math.floor(i));
};
const MESES_LAB = CUM[CUM.length - 1];
const N_PAISES = new Set(TRAYECTORIA.map(it => it.pais)).size;

// pasos del scroll: cada etapa en orden cronológico y un cierre "hoy".
// El gráfico se revela hasta el fin de cada trabajo; en formación, hasta que empieza la etapa siguiente.
const STEPS = [...TRAYECTORIA].sort((a, b) => a.s - b.s).map((it, i, arr) => ({
  it,
  hasta: it.laboral ? it.e : Math.min(it.e, arr[i + 1] ? arr[i + 1].s : it.e)
}));
STEPS.push({ hoy: true, hasta: TODAY_M + 1 });


/* ═══════════════ 5. EXPERIENCIA (scrollytelling) ═══════════════ */
let xpActive = 0, xpReveal = null, xpAnim = 0, xpEls = null;

function buildSteps() {
  const ol = $('#xpSteps');
  STEPS.forEach((st, i) => {
    const li = document.createElement('li');
    li.className = 'step';
    li.dataset.i = i;
    const logo = document.createElement('div');
    logo.className = 'step-logo';
    const period = document.createElement('p'); period.className = 'step-period';
    const role = document.createElement('h3'); role.className = 'step-role';
    const org = document.createElement('p'); org.className = 'step-org';
    const desc = document.createElement('p'); desc.className = 'step-desc';

    if (st.hoy) {
      li.style.setProperty('--pc', 'var(--accent)');
      const led = document.createElement('span'); led.className = 'led'; led.style.fontSize = '26px'; led.style.color = 'var(--accent)'; led.textContent = 'HOY';
      logo.appendChild(led);
      period.textContent = '2025 — hoy';
      role.textContent = 'Ingeniero Comercial';
      org.textContent = `${MESES_LAB} meses de experiencia laboral en ${N_PAISES} países`;
      desc.textContent = 'Titulado con Alto Honor Académico, enfocado en finanzas, control de gestión y análisis de datos.';
      const cta = document.createElement('a');
      cta.className = 'btn btn-primary step-cta'; cta.href = 'CV.pdf'; cta.target = '_blank'; cta.rel = 'noopener';
      cta.append('Descargar CV ', Object.assign(document.createElement('span'), { className: 'arr', textContent: '↗' }));
      li.append(logo, period, role, org, desc, cta);
    } else {
      const it = st.it;
      li.style.setProperty('--pc', PAISES[it.pais].color);
      if (it.logo) {
        if (it.logo.tono) logo.classList.add(it.logo.tono);
        const img = document.createElement('img');
        img.src = it.logo.src; img.alt = it.logo.alt; img.loading = 'lazy';
        img.onerror = () => { img.remove(); logo.appendChild(Object.assign(document.createElement('span'), { className: 'logo-type', textContent: it.corto })); };
        logo.appendChild(img);
      } else {
        const t = document.createElement('span'); t.className = 'logo-type'; t.textContent = it.logoTexto; logo.appendChild(t);
      }
      const dot = document.createElement('i');
      period.append(dot, document.createTextNode(`${it.periodo} · ${PAISES[it.pais].nombre}${it.laboral ? ' · ' + it.meses + ' meses' : ''}`));
      role.textContent = it.titulo;
      org.textContent = it.org;
      desc.textContent = it.desc;
      li.append(logo, period, role, org, desc);
    }
    ol.appendChild(li);
  });
}

function drawXp(container, w) {
  const narrow = w < 460;
  const L = narrow ? 0 : 96, R = w - 4;
  const topY = 12, topH = narrow ? 56 : 132;
  const lanesY = topY + topH + (narrow ? 12 : 28);
  const rowH = narrow ? 26 : 40;
  const axisY = lanesY + FILAS.length * rowH + 2;
  const H = axisY + 22;
  const svg = freshSvg(container, w, H, 'Meses de experiencia laboral acumulados y etapas de formación y trabajo desde 2020');

  const d1 = TODAY_M + 2;
  const x = linear(D0, d1, L, R);
  const yTicks = niceTicks(0, Math.max(MESES_LAB, 4), narrow ? 2 : 3);
  const yT = linear(0, yTicks[yTicks.length - 1], topY + topH, topY + 4);

  const g = svgEl('g', { class: 'ax' }, svg);
  for (let yr = 2020; mIdx(yr, 1) < d1; yr++) {
    const a = mIdx(yr, 1), b = Math.min(mIdx(yr + 1, 1), d1);
    svgEl('line', { x1: x(a), x2: x(a), y1: topY, y2: axisY, class: 'grid-line' }, g);
    if (x(b) - x(a) > 24) svgText(g, (x(a) + x(b)) / 2, axisY + 16, narrow ? "'" + String(yr).slice(2) : String(yr), null, 'middle');
  }
  yTicks.forEach(v => {
    svgEl('line', { x1: L, x2: R, y1: yT(v), y2: yT(v), class: v === 0 ? 'base-line' : 'grid-line' }, g);
    if (!narrow) svgText(g, L - 12, yT(v) + 3.5, String(v), null, 'end');
  });

  // línea acumulada recortada hasta el punto del relato
  const defs = svgEl('defs', null, svg);
  const cp = svgEl('clipPath', { id: 'xpClip' }, defs);
  const clip = svgEl('rect', { x: 0, y: 0, height: H, width: L }, cp);
  const gl = svgEl('g', { 'clip-path': 'url(#xpClip)' }, svg);
  const pts = CUM.map((v, i) => [x(D0 + i), yT(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  svgEl('path', { d: `${d}L${pts[pts.length - 1][0].toFixed(1)},${yT(0)}L${pts[0][0].toFixed(1)},${yT(0)}Z`, class: 'area-ink' }, gl);
  svgEl('path', { d, class: 'ln ln-ink' }, gl);
  const dot = svgEl('circle', { r: 4.5, class: 'dot dot-accent' }, svg);

  // carriles
  FILAS.forEach((f, i) => {
    const ry = lanesY + i * rowH;
    if (i > 0) svgEl('line', { x1: narrow ? 0 : 0, x2: R, y1: ry, y2: ry, class: 'grid-line' }, g);
    if (narrow) svgText(svg, 0, ry + 9.5, f.toUpperCase(), 'ax-label').style.fontSize = '9px';
    else svgText(svg, 0, ry + 26, f, 'ax-strong');
  });
  svgEl('line', { x1: 0, x2: R, y1: lanesY, y2: lanesY, class: 'base-line' }, g);

  const bars = new Map(), labels = new Map();
  TRAYECTORIA.forEach(it => {
    const ry = lanesY + it.fila * rowH;
    const by = ry + (narrow ? 13 : 20), bh = narrow ? 9 : 13;
    const x0 = x(it.s), x1 = x(it.e);
    bars.set(it.id, svgEl('rect', { x: x0, y: by, width: Math.max(3, x1 - x0 - 1), height: bh, rx: 3, class: 'bar p-' + it.pais }, svg));
  });
  if (!narrow) {
    TRAYECTORIA.forEach(it => {
      const ry = lanesY + it.fila * rowH, x0 = x(it.s), x1 = x(it.e);
      const nextStart = Math.min(R, ...TRAYECTORIA.filter(o => o.fila === it.fila && o.s > it.s).map(o => x(o.s)));
      const prevEnd = Math.max(L, ...TRAYECTORIA.filter(o => o.fila === it.fila && o.s < it.s).map(o => x(o.e)));
      for (const txt of [it.corto, it.mini]) {
        const t = svgText(svg, x0, ry + 14, txt, 'bar-label');
        const len = t.getComputedTextLength();
        if (x0 + len < nextStart - 8) { labels.set(it.id, t); break; }
        // barras pegadas al borde derecho (el empleo actual): la etiqueta termina donde termina la barra
        if (x1 - len > prevEnd + 8) { t.setAttribute('x', x1); t.setAttribute('text-anchor', 'end'); labels.set(it.id, t); break; }
        t.remove();
      }
    });
  }

  const xt = x(TODAY_M + NOW.getDate() / 31);
  svgEl('line', { x1: xt, x2: xt, y1: topY, y2: axisY, class: 'today-line' }, svg);
  svgText(svg, xt - 6, topY + 10, 'HOY', 'today-label', 'end');

  // hover: sobre una barra su ficha; en el resto el mes y lo acumulado
  const xh = svgEl('line', { class: 'xhair', y1: topY, y2: axisY, visibility: 'hidden' }, svg);
  const hit = svgEl('rect', { x: 0, y: 0, width: w, height: H, class: 'hit' }, svg);
  const barAt = (px, py) => {
    if (py < lanesY || py > lanesY + FILAS.length * rowH) return null;
    const fila = Math.floor((py - lanesY) / rowH);
    return TRAYECTORIA.find(it => it.fila === fila && px >= x(it.s) - 4 && px <= x(it.e) + 4) || null;
  };
  const move = e => {
    const [px, py] = localPoint(svg, e);
    const it = barAt(px, py);
    hit.style.cursor = it ? 'pointer' : 'crosshair';
    if (it) {
      xh.setAttribute('visibility', 'hidden');
      tip.show(e.clientX, e.clientY, { title: it.periodo, rows: [{ color: PAISES[it.pais].color, value: it.titulo }], desc: it.org });
      return;
    }
    if (px < L - 2) { tip.hide(); return; }
    const m = Math.max(D0, Math.min(TODAY_M, Math.floor(x.invert(px))));
    xh.setAttribute('x1', x(m + 1)); xh.setAttribute('x2', x(m + 1)); xh.setAttribute('visibility', 'visible');
    const act = TRAYECTORIA.filter(t => m >= t.s && m < t.e);
    tip.show(e.clientX, e.clientY, {
      title: mLabel(m),
      rows: [{ color: 'var(--ink)', value: Math.round(cumAt(m + 1)) + ' meses', label: 'experiencia laboral' }]
        .concat(act.map(a => ({ color: PAISES[a.pais].color, value: a.mini, label: a.tipo })))
    });
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); tip.hide(); });
  hit.addEventListener('click', e => {
    const it = barAt(...localPoint(svg, e));
    if (!it) return;
    const i = STEPS.findIndex(s => s.it === it);
    $$('.step')[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  xpEls = { x, yT, clip, dot, bars, labels };
  xpClasses();
  xpPaint();
}

function xpClasses() {
  if (!xpEls) return;
  const st = STEPS[xpActive];
  xpEls.bars.forEach((el, id) => {
    const it = TRAYECTORIA.find(t => t.id === id);
    const on = st.hoy || (st.it && st.it.id === id);
    const future = !st.hoy && it.s >= st.hasta && !on;
    el.classList.toggle('on', on);
    el.classList.toggle('future', future);
    const lb = xpEls.labels.get(id);
    if (lb) { lb.classList.toggle('on', on); lb.classList.toggle('future', future); }
  });
}

function xpPaint() {
  if (!xpEls || xpReveal === null) return;
  const { x, yT, clip, dot } = xpEls;
  clip.setAttribute('width', Math.max(0, x(xpReveal)));
  dot.setAttribute('cx', x(xpReveal));
  dot.setAttribute('cy', yT(cumAt(xpReveal)));
  $('#roMonths').textContent = Math.round(cumAt(xpReveal));
}

function xpSetActive(i) {
  if (i === xpActive && xpReveal !== null) return;
  xpActive = i;
  $$('.step').forEach((el, k) => el.classList.toggle('on', k === i));
  $$('#xpProgress button').forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); });
  const st = STEPS[i];
  const pad = n => String(n).padStart(2, '0');
  $('#roDate').textContent = (st.hoy ? 'hoy' : mLabel(st.hasta - 1)) + ' · ' + pad(i + 1) + '/' + pad(STEPS.length);
  xpClasses();

  const target = st.hasta;
  if (xpReveal === null || REDUCE) { xpReveal = target; xpPaint(); return; }
  const from = xpReveal, t0 = performance.now(), dur = 800;
  cancelAnimationFrame(xpAnim);
  const frame = now => {
    const k = Math.min(1, (now - t0) / dur);
    xpReveal = from + (target - from) * (1 - Math.pow(1 - k, 3));
    xpPaint();
    if (k < 1) xpAnim = requestAnimationFrame(frame);
  };
  xpAnim = requestAnimationFrame(frame);
}

// la etapa activa es la que queda más cerca de la línea de lectura (lo llama el controlador de scroll)
function xpUpdate() {
  const steps = $$('.step');
  if (!steps.length) return;
  const box = $('#xpChartBox').getBoundingClientRect();
  const stacked = innerWidth <= 860;
  const refY = stacked ? box.bottom + (innerHeight - box.bottom) * 0.42 : innerHeight * 0.5;
  let best = 0, bestD = Infinity;
  steps.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - refY);
    if (d < bestD) { bestD = d; best = i; }
  });
  xpSetActive(best);
}
window.xpUpdate = xpUpdate;

// segmentos bajo el gráfico: posición en el relato y atajo a cada etapa
function buildProgress() {
  const box = $('#xpProgress');
  STEPS.forEach((st, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1; // el acceso por teclado es la lista de etapas
    b.title = st.hoy ? 'Hoy' : st.it.corto;
    b.addEventListener('click', () => $$('.step')[i].scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' }));
    box.appendChild(b);
  });
}

buildSteps();
buildProgress();
$$('[data-kpi="meses"]').forEach(el => { el.textContent = MESES_LAB + ' meses'; });
$$('[data-kpi="paises"]').forEach(el => { el.textContent = N_PAISES + ' (' + [...new Set(TRAYECTORIA.map(it => PAISES[it.pais].nombre))].join(', ') + ')'; });
mount($('#chartXp'), drawXp);
xpSetActive(0);


/* ═══════════════ 6. CINTA LED ═══════════════ */
const QUOTES_URL = 'https://raw.githubusercontent.com/blu-chl/blu-chl.github.io/datos/cotizaciones.json';
const QUOTES_KEY = 'blu-cotizaciones';
const IND_KEY = 'blu-indicadores';
const IND_TTL = 30 * 60 * 1000;
const MI = 'https://mindicador.cl/api';

const MK = { quotes: null, ind: null, usdLong: null };

async function getJSON(url, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const readCache = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeCache = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const hhmm = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function tkItem(sym, px, ch) {
  const it = document.createElement('span');
  it.className = 'tk-item';
  const s = document.createElement('span'); s.className = 'tk-sym'; s.textContent = sym;
  const p = document.createElement('span'); p.className = 'tk-px'; p.textContent = px;
  it.append(s, p);
  if (ch) { const c = document.createElement('span'); c.className = 'tk-ch ' + ch.cls; c.textContent = ch.text; it.appendChild(c); }
  return it;
}

function tkBlu() {
  // el único acceso visible a la terminal: una "acción" más de la cinta
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tk-item tk-blu';
  b.setAttribute('aria-label', 'BLU: abrir la terminal');
  const s = document.createElement('span'); s.className = 'tk-sym'; s.textContent = 'BLU';
  const p = document.createElement('span'); p.className = 'tk-px'; p.textContent = 'IPO 2025';
  const c = document.createElement('span'); c.className = 'tk-ch up'; c.textContent = '▲';
  b.append(s, p, c);
  b.addEventListener('click', () => term.open());
  return b;
}

function renderTicker() {
  const q = MK.quotes;
  const fresh = q && Date.now() - Date.parse(q.actualizado) < 5 * DAY;
  const ind = MK.ind;
  const items = [];

  const chg = (p, c) => { const di = deltaInfo(p, c); return { cls: di.cls, text: di.arrow + ' ' + num(Math.abs(di.pct), 2) + '%' }; };
  const quoteItems = fresh ? q.items.map(i => tkItem(i.s, num(i.p, i.d), chg(i.p, i.c))) : [];

  if (fresh) items.push(quoteItems.shift()); // USD/CLP primero
  else if (ind && ind.dolar) items.push(tkItem('DÓLAR OBS', num(ind.dolar.valor, 2)));
  if (ind) {
    if (ind.uf) items.push(tkItem('UF', num(ind.uf.valor, 2)));
    if (ind.utm) items.push(tkItem('UTM', num(ind.utm.valor, 0)));
    if (ind.tpm) items.push(tkItem('TPM', num(ind.tpm.valor, 2) + '%'));
    if (!fresh && ind.libra_cobre) items.push(tkItem('COBRE', num(ind.libra_cobre.valor, 2)));
    if (!fresh && ind.euro) items.push(tkItem('EURO', num(ind.euro.valor, 2)));
  }
  items.push(...quoteItems.slice(0, 7));
  items.push('BLU');
  items.push(...quoteItems.slice(7));
  if (fresh) items.push(tkItem('ACT.', hhmm.format(new Date(q.actualizado)).toUpperCase()));
  if (items.length <= 1) items.unshift(tkItem('MERCADOS', 'SIN CONEXIÓN'));

  const track = $('#tkTrack');
  track.replaceChildren();
  for (let rep = 0; rep < 2; rep++) {
    items.forEach(el => {
      if (el === 'BLU') { track.appendChild(tkBlu()); return; }
      const node = rep ? el.cloneNode(true) : el;
      if (rep) node.setAttribute('aria-hidden', 'true');
      track.appendChild(node);
    });
  }
  $('.ticker .live-dot').classList.toggle('off', !fresh && !ind);
  // velocidad constante sin importar cuántos ítems haya
  requestAnimationFrame(() => track.style.setProperty('--tk-dur', Math.max(30, track.scrollWidth / 2 / 55) + 's'));
}

async function loadTicker() {
  MK.quotes = readCache(QUOTES_KEY);
  const indCache = readCache(IND_KEY);
  if (indCache) MK.ind = indCache.data;
  renderTicker();

  const jobs = [
    getJSON(QUOTES_URL).then(j => { if (j && j.items && j.items.length) { MK.quotes = j; writeCache(QUOTES_KEY, j); } }).catch(() => {})
  ];
  if (!indCache || Date.now() - indCache.t > IND_TTL) {
    jobs.push(getJSON(MI).then(j => { MK.ind = j; writeCache(IND_KEY, { t: Date.now(), data: j }); }).catch(() => {}));
  }
  await Promise.all(jobs);
  renderTicker();
}

loadTicker();


/* ═══════════════ 7. TERMINAL BLU (easter egg) ═══════════════ */
const term = {
  el: $('#term'),
  lastFocus: null,
  tab: 'usd',
  loaded: false,

  open() {
    if (!this.el.hidden) return;
    this.lastFocus = document.activeElement;
    this.el.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    $('#termClose').focus();
    this.show(this.tab);
    if (!this.loaded) { this.loaded = true; loadUsd(); }
  },

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.documentElement.style.overflow = '';
    tip.hide();
    if (location.hash === '#blu') history.replaceState(null, '', location.pathname + location.search);
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  show(t) {
    this.tab = t;
    $$('.term-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
    $$('.term-panel').forEach(p => { p.hidden = p.dataset.p !== t; });
    if (t === 'van') labRender();
  }
};

$('#termClose').addEventListener('click', () => term.close());
$$('.term-tabs button').forEach(b => b.addEventListener('click', () => term.show(b.dataset.t)));

(function termKeys() {
  let buf = '';
  addEventListener('keydown', e => {
    if (!term.el.hidden) {
      if (e.key === 'Escape') term.close();
      else if (e.key === '1' && !e.target.closest('input')) term.show('usd');
      else if (e.key === '2' && !e.target.closest('input')) term.show('van');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
    buf = (buf + e.key.toLowerCase()).slice(-3);
    if (buf === 'blu') { buf = ''; term.open(); }
  });
  if (location.hash === '#blu') term.open();
})();

console.log('%c BLU %c Hay una terminal escondida en este sitio. Escribe BLU en cualquier parte.',
  'font: 900 16px monospace; color: #07080a; background: #ffb13b; padding: 3px 6px', 'color: #888');

/* USD */
let usdRange = '6M';

async function loadUsd() {
  const y = NOW.getFullYear();
  const parse = j => (j.serie || []).map(p => { const [a, b, c] = p.fecha.slice(0, 10).split('-').map(Number); return [new Date(a, b - 1, c).getTime(), +p.valor]; });
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
  try {
    const [a, b, cur] = await Promise.all([
      getJSON(`${MI}/dolar/${y - 1}`).then(parse).catch(() => []),
      getJSON(`${MI}/dolar/${y}`).then(parse).catch(() => []),
      MK.ind ? Promise.resolve(MK.ind) : getJSON(MI).catch(() => null)
    ]);
    const seen = new Set();
    MK.usdLong = a.concat(b).filter(([t, v]) => t <= today && isFinite(v) && !seen.has(t) && seen.add(t)).sort((p, q) => p[0] - q[0]);
    if (cur) MK.ind = cur;
  } catch (e) {}
  renderUsd();
}

function usdSlice() {
  const arr = MK.usdLong || [];
  if (!arr.length) return [];
  const last = arr[arr.length - 1][0];
  const days = { '1M': 31, '3M': 92, '6M': 183, '1A': 365 }[usdRange];
  return arr.filter(p => p[0] >= last - days * DAY).map(([t, v]) => ({ t, v }));
}

const usdChart = mount($('#tChartUsd'), (c, w) => {
  if (!MK.usdLong || !MK.usdLong.length) return;
  drawLine(c, w, { pts: usdSlice(), h: w < 560 ? 230 : 300, fmt: v => money(v, 2), name: 'USD/CLP', label: 'Dólar observado, rango ' + usdRange });
});

function renderUsd() {
  const s = MK.usdLong;
  if (!s || s.length < 2) { $('#tSrc').textContent = 'No se pudo conectar con el Banco Central (mindicador.cl).'; return; }
  const cur = s[s.length - 1], prev = s[s.length - 2];
  const di = deltaInfo(cur[1], prev[1]);
  $('#tUsd').textContent = num(cur[1], 2);
  const d = $('#tUsdDelta');
  d.className = 'delta ' + di.cls;
  d.textContent = `${di.arrow} ${num(Math.abs(di.diff), 2)} (${num(Math.abs(di.pct), 2)}%)`;
  $('#tUsdDate').textContent = '· ' + fmtDate(cur[0]);
  const fmt = { uf: v => '$' + num(v, 2), euro: v => '$' + num(v, 2), libra_cobre: v => num(v, 2), tpm: v => num(v, 2) + '%' };
  $$('#tInds dd').forEach(dd => {
    const k = dd.dataset.k, v = MK.ind && MK.ind[k];
    dd.textContent = v ? fmt[k](v.valor) : '—';
  });
  usdChart.redraw();
}

$$('#tRange button').forEach(b => b.addEventListener('click', () => {
  $$('#tRange button').forEach(x => x.classList.toggle('on', x === b));
  usdRange = b.dataset.r;
  usdChart.redraw();
}));

/* VAN / TIR (horizonte fijo de 6 años) */
const HORIZONTE = 6;
let LAB = null;

function labRender() {
  const inv = +$('#inInv').value, f = +$('#inFlujo').value, r = +$('#inTasa').value / 100;
  const flows = [-inv, ...Array(HORIZONTE).fill(f)];
  const npv = rr => flows.reduce((s, c, t) => s + c / Math.pow(1 + rr, t), 0);

  // TIR por bisección (flujos convencionales: un solo cambio de signo)
  let tir = null, a = -0.99, b = 10, fa = npv(a);
  if (fa * npv(b) < 0) {
    for (let i = 0; i < 200; i++) { const mid = (a + b) / 2, fm = npv(mid); if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; } }
    tir = (a + b) / 2;
  }
  const cum = [];
  let acc = 0, pb = null;
  flows.forEach((c, t) => {
    const dc = c / Math.pow(1 + r, t), before = acc;
    acc += dc; cum.push(acc);
    if (pb === null && t > 0 && before < 0 && acc >= 0) pb = t - 1 + (-before) / dc;
  });
  const van = npv(r);
  LAB = { flows, cum, r, pb };

  $('#lbInv').textContent = mm(inv, 0);
  $('#lbFlujo').textContent = mm(f, 1);
  $('#lbTasa').textContent = num(r * 100, 1) + '%';
  $('#kVan').textContent = (van < 0 ? '−' : '') + num(Math.abs(van), 1);
  $('#kTir').textContent = tir === null ? '—' : num(tir * 100, 1) + '%';
  $('#kPb').textContent = pb === null ? 'NO' : num(pb, 1);

  const v = $('#labVerdict');
  v.replaceChildren();
  const bb = document.createElement('b');
  bb.className = van >= 0 ? 'ok' : 'no';
  bb.textContent = van >= 0 ? '✓ SE ACEPTA · ' : '✕ SE RECHAZA · ';
  v.append(bb, document.createTextNode(van >= 0
    ? `crea valor: VAN ${mm(van, 1)} al ${num(r * 100, 1)}%${tir !== null ? `, TIR ${num(tir * 100, 1)}% > tasa exigida` : ''}.`
    : `destruye valor: VAN ${mm(van, 1)} al ${num(r * 100, 1)}%${tir !== null ? `, TIR ${num(tir * 100, 1)}% < tasa exigida` : ''}.`));
  vanChart.redraw();
}

const vanChart = mount($('#tChartVan'), (container, w) => {
  if (!LAB) return;
  const { flows, cum, r, pb } = LAB;
  const h = w < 560 ? 230 : 270;
  const m = { t: 18, r: 12, b: 30, l: 44 };
  const svg = freshSvg(container, w, h, 'Flujos de caja por año y flujo descontado acumulado');
  const ticks = niceTicks(Math.min(0, ...flows, ...cum), Math.max(0, ...flows, ...cum), 5);
  const y = linear(ticks[0], ticks[ticks.length - 1], h - m.b, m.t);
  const n = flows.length, band = (w - m.l - m.r) / n, bw = Math.min(24, band * 0.55);
  const cx = t => m.l + band * (t + 0.5);

  const g = svgEl('g', { class: 'ax' }, svg);
  ticks.forEach(v => {
    svgEl('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'base-line' : 'grid-line' }, g);
    svgText(g, m.l - 8, y(v) + 3.5, num(v), null, 'end');
  });
  flows.forEach((_, t) => svgText(g, cx(t), h - m.b + 18, t ? 'año ' + t : 'hoy', null, 'middle'));

  const wash = svgEl('rect', { y: m.t, height: h - m.b - m.t, width: band, class: 'band-wash', visibility: 'hidden' }, svg);
  flows.forEach((c, t) => svgEl('path', { d: colPath(cx(t) - bw / 2, y(0), bw, y(c) - y(0)), class: 'f-c1' }, svg));
  svgEl('path', { d: cum.map((v, t) => (t ? 'L' : 'M') + cx(t).toFixed(1) + ',' + y(v).toFixed(1)).join(''), class: 'ln ln-ink' }, svg);
  cum.forEach((v, t) => svgEl('circle', { cx: cx(t), cy: y(v), r: 4, class: 'dot dot-ink' }, svg));

  if (pb !== null) {
    const px = m.l + band * (pb + 0.5);
    svgEl('circle', { cx: px, cy: y(0), r: 4.5, class: 'dot dot-accent' }, svg);
    const right = px < w - m.r - 130;
    svgText(svg, px + (right ? 8 : -8), y(0) + 18, 'payback ' + num(pb, 1) + ' años', 'note-label', right ? 'start' : 'end');
  }

  const hit = svgEl('rect', { x: m.l, y: 0, width: w - m.l - m.r, height: h, class: 'hit' }, svg);
  const move = e => {
    const [px] = localPoint(svg, e);
    const t = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / band)));
    wash.setAttribute('x', m.l + band * t);
    wash.setAttribute('visibility', 'visible');
    tip.show(e.clientX, e.clientY, {
      title: t ? 'Año ' + t : 'Hoy · inversión',
      rows: [{ color: 'var(--c1)', value: mm(flows[t], 1), label: 'flujo' }, { color: 'var(--ink)', value: mm(cum[t], 1), label: 'descontado acumulado' }],
      desc: 'Factor de descuento ' + num(1 / Math.pow(1 + r, t), 3)
    });
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { wash.setAttribute('visibility', 'hidden'); tip.hide(); });
});

['#inInv', '#inFlujo', '#inTasa'].forEach(id => $(id).addEventListener('input', labRender));


/* ═══════════════ 8. SCROLL Y NAVEGACIÓN ═══════════════ */
// Un solo ciclo por frame para todo lo que depende del scroll: la cabecera que se
// oculta al bajar y vuelve al subir, la sección activa del menú, la barra de
// progreso, el fade del hero y la etapa activa de Experiencia. Las posiciones se
// miden solo cuando algo cambia de tamaño, nunca dentro del frame.
(function scrollController() {
  const root = document.documentElement;
  const header = $('#topbar');
  const nav = $('#nav');
  const ink = $('#navInk');
  const links = $$('#nav a[data-sec]');
  const sections = links.map(a => document.getElementById(a.dataset.sec));
  const hero = $('#hero');
  const heroFade = [...$$('#hero .rv'), $('#heroName')];
  const prog = $('#progress');

  let tops = [], heroH = 1, maxScroll = 1, headerH = 64, tickerH = 40;
  let lastY = scrollY, hidden = false, lockUntil = 0, active = -2, ticking = false;

  function moveInk(link) {
    if (!link) { ink.classList.remove('on'); return; }
    ink.style.left = link.offsetLeft + 'px';
    ink.style.width = link.offsetWidth + 'px';
    ink.classList.add('on');
  }

  function measure() {
    tickerH = $('#ticker').offsetHeight;
    headerH = header.offsetHeight;
    root.style.setProperty('--header-h', headerH + 'px');
    heroH = hero.offsetHeight;
    maxScroll = root.scrollHeight - innerHeight;
    tops = sections.map(s => s.getBoundingClientRect().top + scrollY);
    moveInk(links[active]);
  }

  function setHidden(h) {
    if (h === hidden) return;
    hidden = h;
    header.classList.toggle('hide', h);
    root.style.setProperty('--hdr-vis', h ? '0px' : 'var(--header-h)');
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    links.forEach((a, k) => {
      a.classList.toggle('active', k === i);
      if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    moveInk(links[i]);
    if (links[i] && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: links[i].offsetLeft - 16, behavior: 'smooth' });
  }

  function frame() {
    ticking = false;
    const y = scrollY, dy = y - lastY;
    lastY = y;

    // cabecera: siempre visible en el hero; al leer se esconde bajando y vuelve subiendo
    if (performance.now() > lockUntil) {
      if (y < heroH * 0.5) setHidden(false);
      else if (dy > 4) setHidden(true);
      else if (dy < -4) setHidden(false);
    }

    // sección activa: la última cuyo inicio cruzó la línea de lectura (35 % del alto útil)
    const line = y + tickerH + headerH + (innerHeight - tickerH - headerH) * 0.35;
    let i = -1;
    tops.forEach((t, k) => { if (line >= t) i = k; });
    if (y >= maxScroll - 4) i = sections.length - 1; // Contacto es corta: al tocar fondo se marca igual
    setActive(i);

    prog.style.width = (maxScroll > 0 ? y / maxScroll * 100 : 0) + '%';
    const p = Math.min(y / (heroH * 0.7), 1);
    heroFade.forEach(el => { el.style.opacity = p > 0 ? String(1 - p) : ''; });

    xpUpdate();
  }

  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { measure(); request(); }, { passive: true });
  new ResizeObserver(() => { measure(); request(); }).observe(document.body);
  if (document.fonts) document.fonts.ready.then(() => { measure(); request(); });

  // navegación por anclas: la cabecera queda visible mientras dura el desplazamiento
  document.addEventListener('click', e => {
    if (!e.target.closest('a[href^="#"]')) return;
    lockUntil = performance.now() + 1200;
    setHidden(false);
  });

  // cada bloque aparece la primera vez que entra en pantalla
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.panel .rv').forEach((el, k) => { el.style.transitionDelay = ((k % 6) * 60) + 'ms'; reveal.observe(el); });

  measure();
  request();
})();


/* ═══════════════ 9. CONTACTO ═══════════════ */
(function contacto() {
  const mail = $('.contact-mail');
  const copy = $('#copyMail');

  // "Contactar" baja hasta aquí: al llegar, el correo se enciende para que se note el destino
  $$('a[href="#contacto"]').forEach(a => a.addEventListener('click', () => {
    mail.classList.remove('flash');
    void mail.offsetWidth; // reinicia la animación si se hace clic dos veces
    setTimeout(() => mail.classList.add('flash'), REDUCE ? 0 : 750);
  }));
  mail.addEventListener('animationend', () => mail.classList.remove('flash'));

  if (!copy) return;
  copy.addEventListener('click', async () => {
    const text = copy.dataset.mail;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      // respaldo para navegadores sin permiso de portapapeles
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) {}
      ta.remove();
    }
    copy.textContent = ok ? 'Copiado ✓' : text;
    copy.classList.toggle('done', ok);
    clearTimeout(copy._t);
    copy._t = setTimeout(() => { copy.textContent = 'Copiar correo'; copy.classList.remove('done'); }, 2200);
  });
})();
