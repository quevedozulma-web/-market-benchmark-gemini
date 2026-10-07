const COUNTRIES = {
  CO: { nombre: 'Colombia', moneda: 'COP', tasa: 4000, horas: 210, smlv: 1423500 },
  DO: { nombre: 'Dominican Republic', moneda: 'DOP', tasa: 62, horas: 190, smlv: 25000 },
  MX: { nombre: 'Mexico', moneda: 'MXN', tasa: 18.5, horas: 208, smlv: 8364 },
  PE: { nombre: 'Peru', moneda: 'PEN', tasa: 3.7, horas: 208, smlv: 1130 },
  CL: { nombre: 'Chile', moneda: 'CLP', tasa: 950, horas: 180, smlv: 529000 },
  CR: { nombre: 'Costa Rica', moneda: 'CRC', tasa: 510, horas: 208, smlv: 365000 },
};

const LANG = { es: 'Spanish', en: 'English', pt: 'Portuguese' };
const ENGLISH = new Set(['No requerido', 'Básico', 'Intermedio', 'Avanzado', 'Bilingüe', 'No especifica']);

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  },
});

const key = (text = '') => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) && x > 0 ? x : null;
};

const today = () => new Date().toISOString().slice(0, 10);

function stripHtml(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonArray(text) {
  const clean = String(text || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('[');
  if (start < 0) return [];
  let body = clean.slice(start);
  const end = body.lastIndexOf(']');
  if (end >= 0) {
    try { return JSON.parse(body.slice(0, end + 1)); } catch {}
  }
  const lastObject = body.lastIndexOf('}');
  if (lastObject >= 0) {
    try { return JSON.parse(body.slice(0, lastObject + 1) + ']'); } catch {}
  }
  return [];
}

function normalizeVariableType(type = '') {
  const k = key(type);
  if (k.includes('comis')) return 'Comisión';
  if (k.includes('bono') || k.includes('bonus')) return 'Bono';
  if (k.includes('incent') || k.includes('meta')) return 'Incentivo';
  if (k.includes('auxil') || k.includes('allowance')) return 'Auxilio';
  if (k.includes('prima')) return 'Prima extralegal';
  if (k.includes('utilid') || k.includes('profit')) return 'Utilidades';
  return 'Otro';
}

function normalizeOffer(raw, req, country) {
  if (!raw || typeof raw !== 'object') return null;
  const url = typeof raw.u === 'string' && /^https?:\/\//i.test(raw.u) ? raw.u : null;
  if (!url) return null;

  const period = key(raw.per || 'mes');
  const factor = ({
    mes: 1,
    month: 1,
    monthly: 1,
    ano: 1 / 12,
    year: 1 / 12,
    yearly: 1 / 12,
    annual: 1 / 12,
    quincena: 2,
    fortnight: 2,
    semana: 52 / 12,
    week: 52 / 12,
    weekly: 52 / 12,
    dia: 22,
    day: 22,
    daily: 22,
    hora: country.horas,
    hour: country.horas,
    hourly: country.horas
  })[period] || 1;

  const currency = String(raw.m || country.moneda).toUpperCase();
  const currencyFactor = currency === country.moneda ? 1 : currency === 'USD' ? country.tasa : null;

  const local = (value) => {
    const x = n(value);
    return x && currencyFactor ? x * factor * currencyFactor : null;
  };

  let s1 = n(raw.s1), s2 = n(raw.s2);
  if (s1 && !s2) s2 = s1;
  if (s2 && !s1) s1 = s2;

  const min = local(s1), max = local(s2);
  const fijo = min && max ? (min + max) / 2 : null;

  const components = (Array.isArray(raw.vc) ? raw.vc : []).filter(Boolean).map(c => {
    const componentPeriod = key(c.per || 'mes');
    const componentFactor = ({
      mes: 1,
      month: 1,
      monthly: 1,
      ano: 1 / 12,
      year: 1 / 12,
      yearly: 1 / 12,
      annual: 1 / 12,
      quincena: 2,
      fortnight: 2,
      semana: 52 / 12,
      week: 52 / 12,
      weekly: 52 / 12,
      dia: 22,
      day: 22,
      daily: 22,
      hora: country.horas,
      hour: country.horas,
      hourly: country.horas
    })[componentPeriod] || 1;

    let amount = n(c.a);

    if (amount && currencyFactor) {
      amount = amount * currencyFactor * componentFactor;
    } else {
      amount = null;
    }

    if (!amount && n(c.pc) && fijo) {
      amount = fijo * n(c.pc) / 100 / 12;
    }

    return {
      tipo: normalizeVariableType(c.k),
      monto: amount
    };
  });

  const withAmounts = components.filter(c => c.monto);
  const variable = withAmounts.length
    ? withAmounts.reduce((sum, c) => sum + c.monto, 0)
    : null;

  const sinMonto = components.length > 0 && !variable;
  const total = fijo && !sinMonto ? fijo + (variable || 0) : null;
  const ingles = ENGLISH.has(raw.ing) ? raw.ing : 'No especifica';
  const cargoNorm = key(req.cargo);

  return {
    id: `${cargoNorm}|${req.pais}|${url}`,
    cargo: cargoNorm,
    cargoTexto: req.cargo,
    pais: req.pais,
    ciudad: String(raw.c || req.ciudad || 'Remote').trim(),
    titulo: raw.t || 'Sin título',
    rol: raw.r || raw.t || 'Sin título',
    empresa: raw.e || null,
    fuente: raw.f || (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    })(),
    url,
    publicada: /^\d{4}-\d{2}-\d{2}$/.test(raw.p || '') ? raw.p : null,
    consultada: today(),
    fijo,
    variable,
    total,
    componentes: components,
    sinMonto,
    ingles,
    exp: raw.x != null && Number.isFinite(Number(raw.x)) ? Number(raw.x) : null,
    educacion: raw.ed || null,
    funciones: Array.isArray(raw.fn) ? raw.fn.slice(0, 4) : [],
    requisitos: Array.isArray(raw.rq) ? raw.rq.slice(0, 4) : [],
    equivalente: !!raw.eq,
    alerta: !!(fijo && fijo < country.smlv * 0.5),
  };
}

async function fetchJson(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': 'MarketBenchmark/1.0',
      ...(init.headers || {})
    }
  });

  if (!r.ok) {
    throw new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
  }

  return r.json();
}

async function sourceJobicy(req) {
  const u = new URL('https://jobicy.com/api/v2/remote-jobs');
  u.searchParams.set('count', '100');
  u.searchParams.set('tag', req.cargo);

  const data = await fetchJson(u.toString());

  return (data.jobs || []).map(j => ({
    source: 'Jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo || 'Remote',
    url: j.url,
    date: j.pubDate ? String(j.pubDate).slice(0, 10) : null,
    salaryMin: j.salaryMin ?? null,
    salaryMax: j.salaryMax ?? null,
    salaryCurrency: j.salaryCurrency ?? null,
    salaryPeriod: j.salaryPeriod ?? null,
    level: j.jobLevel ?? null,
    description: stripHtml(j.jobDescription || j.jobExcerpt || '').slice(0, 7000),
  }));
}

async function sourceRemoteOK(req) {
  const data = await fetchJson('https://remoteok.com/api');

  const rows = Array.isArray(data)
    ? data.filter(x => x && x.position)
    : [];

  const words = key(req.cargo).split(' ').filter(w => w.length > 2);

  return rows
    .filter(j => {
      const hay = key(`${j.position || ''} ${(j.tags || []).join(' ')} ${j.description || ''}`);
      return words.length ? words.some(w => hay.includes(w)) : true;
    })
    .slice(0, 60)
    .map(j => ({
      source: 'Remote OK',
      title: j.position,
      company: j.company,
      location: j.location || 'Remote',
      url: j.url || j.apply_url,
      date: j.date ? String(j.date).slice(0, 10) : null,
      salaryMin: j.salary_min ?? null,
      salaryMax: j.salary_max ?? null,
      salaryCurrency: j.salary_currency || 'USD',
      salaryPeriod: j.salary_min || j.salary_max ? 'yearly' : null,
      level: null,
      description: stripHtml(j.description || '').slice(0, 7000),
    }));
}

async function sourceRemotive(req) {
  const u = new URL('https://remotive.com/api/remote-jobs');
  u.searchParams.set('search', req.cargo);
  u.searchParams.set('limit', '60');

  const data = await fetchJson(u.toString());

  return (data.jobs || []).map(j => ({
    source: 'Remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    url: j.url,
    date: j.publication_date ? String(j.publication_date).slice(0, 10) : null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    level: null,
    description: stripHtml(`${j.salary || ''} ${j.description || ''}`).slice(0, 7000),
  }));
}

async function sourceArbeitnow(req) {
  const data = await fetchJson('https://www.arbeitnow.com/api/job-board-api');
  const words = key(req.cargo).split(' ').filter(w => w.length > 2);

  return (data.data || [])
    .filter(j => {
      const hay = key(`${j.title || ''} ${j.description || ''}`);
      return words.length ? words.some(w => hay.includes(w)) : true;
    })
    .slice(0, 40)
    .map(j => ({
      source: 'Arbeitnow',
      title: j.title,
      company: j.company_name,
      location: j.location || (j.remote ? 'Remote' : ''),
      url: j.url,
      date: j.created_at
        ? new Date(j.created_at * 1000).toISOString().slice(0, 10)
        : null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      level: null,
      description: stripHtml(j.description || '').slice(0, 7000),
    }));
}

function dedupeCandidates(rows) {
  const seen = new Set();
  const out = [];

  for (const r of rows) {
    if (!r?.url || !r?.title) continue;

    const k = key(`${r.title}|${r.company}|${r.url}`);
    if (seen.has(k)) continue;

    seen.add(k);
    out.push(r);
  }

  return out;
}

async function collectFreeJobs(req) {
  const tasks = [
    sourceJobicy(req),
    sourceRemoteOK(req),
    sourceRemotive(req),
    sourceArbeitnow(req)
  ];

  const settled = await Promise.allSettled(tasks);

  const rows = settled
    .filter(x => x.status === 'fulfilled')
    .flatMap(x => x.value);

  const errors = settled
    .filter(x => x.status === 'rejected')
    .map(x => x.reason?.message || 'source failed');

  return {
    rows: dedupeCandidates(rows).slice(0, 80),
    errors
  };
}

function promptFor(req, country, candidates) {
  const place = req.ciudad
    ? `${req.ciudad}, ${country.nombre}`
    : country.nombre;

  const compact = candidates.map((j, idx) => ({
    i: idx,
    source: j.source,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    date: j.date,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency,
    salaryPeriod: j.salaryPeriod,
    level: j.level,
    description: j.description,
  }));

  return `You are a compensation analyst. You are NOT allowed to browse the web. Analyze only the job records supplied below.

Target role: "${req.cargo}"
Target market: ${place}
Preferred posting language: ${LANG[req.idioma] || 'Spanish'}

The sources are free public job feeds and are mostly remote-job sources.

Include a record only when:
1) the role is the requested role or genuinely comparable by duties, AND
2) its stated location is compatible with ${country.nombre}${req.ciudad ? ` / ${req.ciudad}` : ''}, OR it clearly permits Worldwide, Latin America, LATAM, Americas, or fully remote work that could include the target country.

Do NOT claim a job is located in the target city when the source says Remote/Worldwide.
Preserve the source location in c.

Return ONLY a JSON array. Maximum 20 objects.

Each object must use exactly:
{
  "t": "original posting title",
  "r": "standard comparable role name",
  "e": "company or null",
  "c": "location exactly as supported by source",
  "f": "source name",
  "u": "exact supplied source URL",
  "p": "YYYY-MM-DD or null",
  "s1": "fixed/base salary minimum as full number or null",
  "s2": "fixed/base salary maximum as full number or null",
  "m": "ISO currency code or null",
  "per": "mes|año|quincena|semana|dia|hora|null",
  "vc": [
    {
      "k": "Comisión|Bono|Incentivo|Auxilio|Prima extralegal|Utilidades|Otro",
      "a": "stated amount or null",
      "per": "mes|año|quincena|semana|dia|hora|null",
      "pc": "annual percentage of base salary or null"
    }
  ],
  "x": "minimum years of experience as number or null",
  "ing": "No requerido|Básico|Intermedio|Avanzado|Bilingüe|No especifica",
  "ed": "education level or null",
  "fn": ["3-6 word duty","3-6 word duty","3-6 word duty"],
  "rq": ["short requirement","short requirement"],
  "eq": true
}

Rules:
- Use ONLY the supplied records.
- Never invent URLs, employers, compensation, dates, requirements, or locations.
- Keep u exactly equal to a supplied URL.
- Keep f exactly equal to its source.
- Salary must come from explicit source fields/text.
- Never estimate salary.
- If the source gives annual pay, keep per="año".
- Monthly = "mes".
- Hourly = "hora".
- s1/s2 are fixed/base pay only.
- Variable pay belongs only in vc.
- "Competitive", "DOE", "depending on experience", or missing salary = null.
- If English is not explicitly required, use "No especifica".
- eq=true only when the title differs from the searched role but duties are genuinely comparable.
- Prefer records with published salary, then relevance, then recency.

SOURCE RECORDS:
${JSON.stringify(compact)}`;
}

async function analyzeWithGemini(req, env, candidates) {
  const country = COUNTRIES[req.pais];
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: promptFor(req, country, candidates)
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini API error (${response.status})`
    );
  }

  const text = (data.candidates || [])
    .flatMap(c => c.content?.parts || [])
    .map(p => p.text || '')
    .join('\n');

  const parsed = parseJsonArray(text);
  const suppliedUrls = new Set(candidates.map(c => c.url));

  const normalized = parsed
    .filter(o => suppliedUrls.has(o?.u))
    .map(o => normalizeOffer(o, req, country))
    .filter(Boolean);

  return {
    ofertas: [...new Map(normalized.map(o => [o.id, o])).values()],
    model
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,GET,OPTIONS',
          'access-control-allow-headers': 'content-type'
        }
      });
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        geminiConfigured: !!env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL || 'gemini-3.8-flash',
        searchMode: 'free-public-feeds',
        sources: [
          'Jobicy',
          'Remote OK',
          'Remotive',
          'Arbeitnow'
        ],
      });
    }

    if (url.pathname === '/api/search') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405);
      }

      if (!env.GEMINI_API_KEY) {
        return json({
          error: 'GEMINI_API_KEY is not configured in Cloudflare.'
        }, 500);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON request.' }, 400);
      }

      const req = {
        cargo: String(body?.cargo || '').trim().slice(0, 120),
        pais: String(body?.pais || '').trim().toUpperCase(),
        ciudad: String(body?.ciudad || '').trim().slice(0, 100),
        idioma: String(body?.idioma || 'es').trim().toLowerCase(),
      };

      if (req.cargo.length < 3) {
        return json({ error: 'Enter a valid job title.' }, 400);
      }

      if (!COUNTRIES[req.pais]) {
        return json({ error: 'Unsupported country.' }, 400);
      }

      if (!LANG[req.idioma]) {
        req.idioma = 'es';
      }

      try {
        const collected = await collectFreeJobs(req);

        if (!collected.rows.length) {
          return json({
            error: 'No matching vacancies were returned by the free public job feeds. Try a more common English job title or broaden the location.'
          }, 404);
        }

        const result = await analyzeWithGemini(
          req,
          env,
          collected.rows
        );

        if (!result.ofertas.length) {
          return json({
            error: 'The free sources returned vacancies, but none could be verified as comparable for this role/location. Try the whole country, English search language, or a more common job title.',
            freeSourcesChecked: 4,
            candidatesReviewed: collected.rows.length,
          }, 404);
        }

        return json({
          ...result,
          searchMode: 'free-public-feeds',
          candidatesReviewed: collected.rows.length,
          sourceWarnings: collected.errors,
        });

      } catch (e) {
        return json({
          error: e?.message || 'Search failed.'
        }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};