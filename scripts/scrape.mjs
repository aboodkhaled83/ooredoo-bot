// يقرأ صفحات ooredoo.ps ويحفظها في public/data/ooredoo.json
// يعمل تلقائيًا عبر GitHub Actions، ويمكن تشغيله محليًا: npm install && npm run scrape
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';

const START = (process.env.START_URLS || 'https://ooredoo.ps').split(',').map(s => s.trim()).filter(Boolean);
const MAX_PAGES = Number(process.env.MAX_PAGES) || 120;
const DELAY_MS = Number(process.env.DELAY_MS) || 800;
const USE_BROWSER = process.env.USE_BROWSER === '1';
const OUT = 'public/data/ooredoo.json';
const UA = 'OoredooInfoBot/1.0 (unofficial personal project)';

const hosts = new Set();
for (const u of START) {
  const h = new URL(u).hostname.replace(/^www\./, '');
  hosts.add(h); hosts.add('www.' + h);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- robots.txt (قراءة مبسّطة لقواعد User-agent: *) ----------
async function loadRobots(origin) {
  const rules = [];
  try {
    const res = await fetch(origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return rules;
    let applies = false;
    for (const raw of (await res.text()).split('\n')) {
      const line = raw.split('#')[0].trim();
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase(), val = m[2].trim();
      if (key === 'user-agent') applies = val === '*';
      else if (applies && (key === 'disallow' || key === 'allow') && val) rules.push({ allow: key === 'allow', path: val });
    }
  } catch { /* لا يوجد robots.txt */ }
  return rules;
}
function allowedByRobots(rules, url) {
  const p = new URL(url).pathname;
  let best = null;
  for (const r of rules) {
    if (p.startsWith(r.path.replace(/\*$/, '')) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

// ---------- جلب الصفحة ----------
let browser;
async function getHtml(url) {
  if (USE_BROWSER) {
    const { chromium } = await import('playwright');
    browser ??= await chromium.launch();
    const page = await browser.newPage({ userAgent: UA });
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      return await page.content();
    } finally { await page.close(); }
  }
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ar,en;q=0.8' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!(res.headers.get('content-type') || '').includes('text/html')) throw new Error('not html');
  return await res.text();
}

function clean(u, base) {
  try {
    const x = new URL(u, base);
    x.hash = '';
    if (!hosts.has(x.hostname)) return null;
    if (!/^https?:$/.test(x.protocol)) return null;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|mp4|mp3|docx?|xlsx?|apk|ico|css|js)$/i.test(x.pathname)) return null;
    return x.href.replace(/\/$/, '');
  } catch { return null; }
}

function extract(html, url) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe,form,template').remove();
  const title = ($('title').text() || $('h1').first().text() || url).replace(/\s+/g, ' ').trim();
  const desc = $('meta[name="description"]').attr('content') || '';
  $('br').replaceWith('\n');
  $('p,div,li,tr,h1,h2,h3,h4,h5,h6,section,article,header,footer,nav,dt,dd').each((_, el) => { $(el).append('\n'); });
  const lines = [];
  if (desc) lines.push(desc.trim());
  for (const l of $('body').text().split('\n')) {
    const t = l.replace(/\s+/g, ' ').trim();
    if (t.length > 1) lines.push(t);
  }
  const links = [];
  $('a[href]').each((_, a) => { const c = clean($(a).attr('href'), url); if (c) links.push(c); });
  return { title, lines: [...new Set(lines)], links };
}

// ---------- الزحف ----------
async function main() {
  const origin = new URL(START[0]).origin;
  const robots = await loadRobots(origin);
  const queue = START.map(u => clean(u, u)).filter(Boolean);

  try { // خريطة الموقع إن وجدت
    const sm = await fetch(origin + '/sitemap.xml', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (sm.ok) for (const m of (await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) { const c = clean(m[1], origin); if (c) queue.push(c); }
  } catch {}

  const seen = new Set(), pages = [];
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    if (!allowedByRobots(robots, url)) { console.log('robots يمنع:', url); continue; }
    try {
      const { title, lines, links } = extract(await getHtml(url), url);
      pages.push({ url, title, lines });
      for (const l of links) if (!seen.has(l)) queue.push(l);
      console.log(`✔ ${url} (${lines.length} سطر)`);
    } catch (e) { console.log(`✘ ${url}: ${e.message}`); }
    await sleep(DELAY_MS);
  }
  if (browser) await browser.close();

  // إزالة الأسطر المتكررة في أغلب الصفحات (القوائم والتذييل) وحفظها مرة واحدة
  const freq = new Map();
  for (const p of pages) for (const l of p.lines) freq.set(l, (freq.get(l) || 0) + 1);
  const common = new Set();
  if (pages.length >= 6) for (const [l, c] of freq) if (c / pages.length > 0.4) common.add(l);
  const chunks = [];
  const pushChunks = (url, title, lines) => {
    let buf = '';
    for (const l of lines) {
      if (buf && buf.length + l.length > 900) { chunks.push({ url, title, text: buf.trim() }); buf = ''; }
      buf += l + '\n';
    }
    if (buf.trim().length > 40) chunks.push({ url, title, text: buf.trim() });
  };
  for (const p of pages) pushChunks(p.url, p.title, p.lines.filter(l => !common.has(l)));
  if (common.size) pushChunks(START[0], 'معلومات عامة من الموقع (القوائم والتذييل)', [...common].slice(0, 80));

  if (!chunks.length) {
    console.error('لم يُستخرج أي محتوى. إن كانت الصفحات تُحمَّل بجافاسكربت فعّل USE_BROWSER=1.');
    process.exit(1);
  }
  const avg = chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length;
  if (avg < 120) console.warn('تحذير: النصوص قصيرة جدًا، ربما تحتاج USE_BROWSER=1');

  let old = null;
  try { old = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch {}
  if (old && JSON.stringify(old.chunks) === JSON.stringify(chunks)) { console.log('لا تغيير في المحتوى.'); return; }
  await fs.writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), pages: pages.length, chunks }));
  console.log(`تم الحفظ: ${pages.length} صفحة، ${chunks.length} مقطع`);
}
main().catch(e => { console.error(e); process.exit(1); });
