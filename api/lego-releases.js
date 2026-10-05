// Sorties LEGO du mois et sets annoncés, depuis l'API Brickset v3.
// La clé reste côté serveur (variable Vercel BRICKSET_API_KEY) ; la réponse est mise en cache
// par Vercel pour rester très loin du quota Brickset (100 recherches getSets par jour).
const API = 'https://brickset.com/api/v3.asmx/getSets';
const PAGE_SIZE = 500;
const MAX_PAGES = 3;
const UPCOMING_LIMIT = 48;
// Thèmes Brickset qui ne sont pas de vrais sets à construire.
const EXCLUDED_THEMES = new Set(['Gear', 'Books', 'Promotional', 'Miscellaneous', 'Service Packs', 'Bulk Bricks', 'Education', 'Key Chains', 'Magnets', 'Collectable Minifigures', 'Duplo', 'Dots']);

const rateBuckets = new Map();
function allowRequest(req, limit = 60, windowMs = 60000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = rateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function timedFetch(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'MaBriquotheque/1.0' } }); }
  finally { clearTimeout(timer); }
}

async function getSets(key, params) {
  const query = new URLSearchParams({ apiKey: key, userHash: '', params: JSON.stringify(params) });
  const response = await timedFetch(`${API}?${query}`);
  if (!response.ok) throw new Error(`Brickset HTTP ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(data.message || 'Réponse Brickset invalide');
  return data;
}

async function setsForYear(key, year) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getSets(key, { year: String(year), pageSize: PAGE_SIZE, pageNumber: page });
    const sets = data.sets || [];
    all.push(...sets);
    if (!sets.length || all.length >= (data.matches || 0)) break;
  }
  return all;
}

const day = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

function normalize(s) {
  const lego = s.LEGOCom || {};
  const de = lego.DE || {}, uk = lego.UK || {}, us = lego.US || {};
  return {
    number: `${s.number}-${s.numberVariant || 1}`,
    name: s.name || '',
    theme: s.theme || '',
    subtheme: s.subtheme || '',
    year: s.year || null,
    pieces: s.pieces ?? null,
    minifigs: s.minifigs ?? null,
    image: s.image?.imageURL || s.image?.thumbnailURL || null,
    // Date de sortie officielle d'abord : la date de la boutique allemande correspond souvent
    // à l'accès anticipé des membres Insiders, quelques semaines avant.
    date: day(s.launchDate) || day(de.dateFirstAvailable) || day(uk.dateFirstAvailable) || day(us.dateFirstAvailable),
    promo: /promotional/i.test(s.subtheme || ''),
    exitDate: day(s.exitDate) || day(de.dateLastAvailable),
    priceEUR: typeof de.retailPrice === 'number' && de.retailPrice > 0 ? de.retailPrice : null,
    released: s.released !== false,
    url: s.bricksetURL || `https://brickset.com/sets/${s.number}-${s.numberVariant || 1}`,
    // Les sets pas encore dévoilés apparaissent chez Brickset avec un nom « {?} » : on les écarte.
    _keep: (s.category ? s.category === 'Normal' : true) && s.packagingType !== 'Polybag' && !EXCLUDED_THEMES.has(s.theme)
      && Boolean(s.name) && !/^\{.*\}$/.test(s.name.trim()) && s.theme !== 'tbd',
  };
}

function parisToday() {
  // "en-CA" formate en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

let memo = null; // Cache mémoire de l'instance, en plus du cache CDN.

async function buildReleases(key) {
  const today = parisToday();
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);
  const raw = [...await setsForYear(key, year), ...await setsForYear(key, year + 1)];
  const seen = new Set();
  const sets = raw.map(normalize).filter((s) => s._keep && !seen.has(s.number) && seen.add(s.number));
  sets.forEach((s) => delete s._keep);

  const byDateThenSize = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (b.pieces || 0) - (a.pieces || 0);
  const thisMonth = sets.filter((s) => s.date && s.date.slice(0, 7) === month).sort(byDateThenSize);
  const upcoming = sets
    .filter((s) => (s.date ? s.date.slice(0, 7) > month : !s.released))
    .sort(byDateThenSize)
    .slice(0, UPCOMING_LIMIT);
  return { month, today, updatedAt: new Date().toISOString(), thisMonth, upcoming };
}

export default async function handler(req, res) {
  if (!allowRequest(req)) { res.setHeader('Cache-Control', 'no-store'); return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans une minute.' }); }
  const key = process.env.BRICKSET_API_KEY;
  if (!key) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'Clé Brickset non configurée.' }); }
  try {
    if (!memo || memo.expires < Date.now() || memo.data.month !== parisToday().slice(0, 7)) {
      memo = { data: await buildReleases(key), expires: Date.now() + 6 * 3600 * 1000 };
    }
    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json(memo.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Brickset est injoignable pour le moment.', detail: String(error.message || error).replace(key, '***') });
  }
}
