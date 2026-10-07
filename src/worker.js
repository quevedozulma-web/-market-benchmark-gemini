const COUNTRIES = {
  CO: { nombre: "Colombia", moneda: "COP", tasa: 4000, horas: 210, smlv: 1423500, domain: "co" },
  DO: { nombre: "Dominican Republic", moneda: "DOP", tasa: 62, horas: 190, smlv: 25000, domain: "do" },
  MX: { nombre: "Mexico", moneda: "MXN", tasa: 18.5, horas: 208, smlv: 8364, domain: "mx" },
  PE: { nombre: "Peru", moneda: "PEN", tasa: 3.7, horas: 208, smlv: 1130, domain: "pe" },
  CL: { nombre: "Chile", moneda: "CLP", tasa: 950, horas: 180, smlv: 529000, domain: "cl" },
  CR: { nombre: "Costa Rica", moneda: "CRC", tasa: 510, horas: 208, smlv: 365000, domain: "cr" },
};

const LANG = { es: "Spanish", en: "English", pt: "Portuguese" };
const ENGLISH = new Set(["No requerido", "Básico", "Intermedio", "Avanzado", "Bilingüe", "No especifica"]);

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

const key = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slug = (text = "") =>
  key(text).replace(/\s+/g, "-");

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) && x > 0 ? x : null;
};

const today = () => new Date().toISOString().slice(0, 10);

function decodeHtml(s = "") {
  return String(s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, x) => String.fromCharCode(Number(x)));
}

function stripHtml(s = "") {
  return decodeHtml(String(s))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseLinks(html, baseUrl, allowedHosts = []) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(html))) {
    const url = absoluteUrl(decodeHtml(m[1]), baseUrl);
    const text = stripHtml(m[2]);

    if (!url || !text || text.length < 3) continue;

    let host;

    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }

    if (
      allowedHosts.length &&
      !allowedHosts.some(
        h => host === h || host.endsWith("." + h)
      )
    ) continue;

    const k = `${url}|${key(text)}`;

    if (seen.has(k)) continue;

    seen.add(k);
    out.push({ url, text });
  }

  return out;
}

function roleVariants(cargo) {
  const raw = String(cargo || "").trim();
  const k = key(raw);
  const variants = new Set([raw]);

  const groups = [
    {
      test: /compens|rewards?|remuner/,
      items: [
        "Analista de compensación",
        "Analista de compensaciones",
        "Analista de compensación y beneficios",
        "Analista de compensación total",
        "Compensation Analyst",
        "Compensation & Benefits Analyst",
        "Total Rewards Analyst",
        "Rewards Analyst"
      ],
    },
    {
      test: /nomina|payroll/,
      items: [
        "Analista de nómina",
        "Payroll Analyst",
        "Payroll Specialist",
        "Analista de nómina y compensación"
      ],
    },
    {
      test: /benefit|beneficio/,
      items: [
        "Analista de beneficios",
        "Benefits Analyst",
        "Compensation & Benefits Analyst",
        "Total Rewards Analyst"
      ],
    },
    {
      test: /recruit|reclut|talent acquisition|seleccion/,
      items: [
        "Recruiter",
        "Talent Acquisition Specialist",
        "Analista de selección",
        "Analista de reclutamiento"
      ],
    },
    {
      test: /human resources|recursos humanos|gestion humana|hr analyst/,
      items: [
        "HR Analyst",
        "Human Resources Analyst",
        "Analista de Recursos Humanos",
        "Analista de Gestión Humana"
      ],
    },
  ];

  for (const g of groups) {
    if (g.test.test(k)) {
      g.items.forEach(v => variants.add(v));
    }
  }

  return [...variants].slice(0, 10);
}

async function fetchText(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "es-CO,es;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; MarketBenchmark/2.0; +https://workers.dev)",
        ...(init.headers || {}),
      },
    });

    if (!r.ok) {
      throw new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
    }

    return await r.text();

  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, init = {}) {
  const text = await fetchText(url, init);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).hostname}: invalid JSON`);
  }
}

function listingRecord({ source, url, title, location, description }) {
  return {
    source,
    title: title || "Job listing",
    company: null,
    location: location || "",
    url,
    date: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    level: null,
    description: String(description || "").slice(0, 9000),
  };
}

/* =========================================================
   COMPUTRABAJO
========================================================= */

async function sourceComputrabajo(req, variants) {
  if (req.pais !== "CO") return [];

  const records = [];

  for (const term of variants.slice(0, 4)) {
    const url =
      `https://co.computrabajo.com/trabajo-de-${slug(term)}`;

    try {
      const html = await fetchText(url);

      const links = parseLinks(
        html,
        url,
        ["co.computrabajo.com"]
      )
        .filter(
          x =>
            /oferta|empleo|trabajo/i.test(x.url) &&
            x.text.length > 4
        )
        .slice(0, 15);

      if (links.length) {
        for (const x of links) {
          records.push(
            listingRecord({
              source: "Computrabajo",
              url: x.url,
              title: x.text,
              location: req.ciudad || req.pais,
              description: stripHtml(html).slice(0, 5000),
            })
          );
        }
      } else {
        records.push(
          listingRecord({
            source: "Computrabajo",
            url,
            title: term,
            location: req.ciudad || "Colombia",
            description: stripHtml(html),
          })
        );
      }

    } catch {}
  }

  return records;
}

/* =========================================================
   EL EMPLEO
========================================================= */

async function sourceElEmpleo(req, variants) {
  if (req.pais !== "CO") return [];

  const records = [];

  for (const term of variants.slice(0, 4)) {

    const base =
      req.ciudad &&
      key(req.ciudad) === "bogota"
        ? `https://www.elempleo.com/co/ofertas-empleo/bogota/trabajo-${slug(term)}`
        : `https://www.elempleo.com/co/ofertas-empleo/trabajo-${slug(term)}`;

    try {
      const html = await fetchText(base);

      const links = parseLinks(
        html,
        base,
        ["elempleo.com"]
      )
        .filter(
          x =>
            /ofertas-trabajo|oferta-trabajo/i.test(x.url)
        )
        .slice(0, 15);

      if (links.length) {

        for (const x of links) {

          records.push(
            listingRecord({
              source: "El Empleo",
              url: x.url,
              title: x.text,
              location: req.ciudad || "Colombia",
              description: stripHtml(html).slice(0, 6000),
            })
          );
        }

      } else {

        records.push(
          listingRecord({
            source: "El Empleo",
            url: base,
            title: term,
            location: req.ciudad || "Colombia",
            description: stripHtml(html),
          })
        );
      }

    } catch {}
  }

  return records;
}

/* =========================================================
   INDEED DIRECT
========================================================= */

async function sourceIndeed(req, variants) {
  const country = COUNTRIES[req.pais];

  if (!country) return [];

  const sub = country.domain || "www";
  const host = `${sub}.indeed.com`;

  const records = [];

  for (const term of variants.slice(0, 3)) {

    const u = new URL(`https://${host}/jobs`);

    u.searchParams.set("q", term);

    if (req.ciudad) {
      u.searchParams.set("l", req.ciudad);
    }

    try {

      const html = await fetchText(
        u.toString()
      );

      const links = parseLinks(
        html,
        u.toString(),
        [host]
      )
        .filter(
          x =>
            /viewjob|clk\?|rc\/clk|jobs\?/i.test(x.url)
        )
        .slice(0, 12);

      for (const x of links) {

        records.push(
          listingRecord({
            source: "Indeed",
            url: x.url,
            title: x.text,
            location: req.ciudad || country.nombre,
            description: stripHtml(html).slice(0, 5000),
          })
        );
      }

    } catch {}
  }

  return records;
}

/* =========================================================
   FREE PUBLIC WEB DISCOVERY
========================================================= */

function unwrapDuckDuckGo(url) {
  try {

    const u =
      new URL(
        url,
        "https://html.duckduckgo.com"
      );

    const uddg =
      u.searchParams.get("uddg");

    return uddg
      ? decodeURIComponent(uddg)
      : u.toString();

  } catch {
    return url;
  }
}

async function discoverDomain(
  req,
  variants,
  domain,
  sourceName
) {

  const out = [];

  for (const term of variants.slice(0, 3)) {

    const query =
      `site:${domain} "${term}" "${COUNTRIES[req.pais].nombre}" ${req.ciudad || ""}`;

    const u =
      new URL(
        "https://html.duckduckgo.com/html/"
      );

    u.searchParams.set(
      "q",
      query
    );

    try {

      const html =
        await fetchText(
          u.toString(),
          {},
          10000
        );

      const links =
        parseLinks(
          html,
          u.toString()
        )
          .map(
            x => ({
              ...x,
              url:
                unwrapDuckDuckGo(
                  x.url
                )
            })
          )
          .filter(
            x => {
              try {
                const h =
                  new URL(
                    x.url
                  )
                    .hostname
                    .replace(
                      /^www\./,
                      ""
                    );

                return (
                  h === domain ||
                  h.endsWith(
                    "." + domain
                  )
                );

              } catch {
                return false;
              }
            }
          )
          .slice(
            0,
            10
          );

      for (const x of links) {

        out.push(
          listingRecord({
            source:
              sourceName,

            url:
              x.url,

            title:
              x.text,

            location:
              req.ciudad ||
              COUNTRIES[
                req.pais
              ].nombre,

            description:
              x.text,
          })
        );
      }

    } catch {}
  }

  return out;
}

async function sourceMagneto(
  req,
  variants
) {

  return discoverDomain(
    req,
    variants,
    "magneto365.com",
    "Magneto"
  );
}

async function sourceIndeedDiscovery(
  req,
  variants
) {

  const domain =
    req.pais === "CO"
      ? "co.indeed.com"
      : "indeed.com";

  return discoverDomain(
    req,
    variants,
    domain,
    "Indeed"
  );
}

/* =========================================================
   JOBICY
========================================================= */

async function sourceJobicy(
  req,
  variants
) {

  const all = [];

  for (
    const term
    of variants.slice(0, 3)
  ) {

    try {

      const u =
        new URL(
          "https://jobicy.com/api/v2/remote-jobs"
        );

      u.searchParams.set(
        "count",
        "100"
      );

      u.searchParams.set(
        "tag",
        term
      );

      const data =
        await fetchJson(
          u.toString()
        );

      for (
        const j
        of (data.jobs || [])
      ) {

        all.push({
          source:
            "Jobicy",

          title:
            j.jobTitle,

          company:
            j.companyName,

          location:
            j.jobGeo ||
            "Remote",

          url:
            j.url,

          date:
            j.pubDate
              ? String(
                  j.pubDate
                ).slice(
                  0,
                  10
                )
              : null,

          salaryMin:
            j.salaryMin ??
            null,

          salaryMax:
            j.salaryMax ??
            null,

          salaryCurrency:
            j.salaryCurrency ??
            null,

          salaryPeriod:
            j.salaryPeriod ??
            null,

          level:
            j.jobLevel ??
            null,

          description:
            stripHtml(
              j.jobDescription ||
              j.jobExcerpt ||
              ""
            ).slice(
              0,
              7000
            ),
        });
      }

    } catch {}
  }

  return all;
}

/* =========================================================
   REMOTIVE
========================================================= */

async function sourceRemotive(
  req,
  variants
) {

  const all = [];

  for (
    const term
    of variants.slice(0, 3)
  ) {

    try {

      const u =
        new URL(
          "https://remotive.com/api/remote-jobs"
        );

      u.searchParams.set(
        "search",
        term
      );

      u.searchParams.set(
        "limit",
        "50"
      );

      const data =
        await fetchJson(
          u.toString()
        );

      for (
        const j
        of (data.jobs || [])
      ) {

        all.push({
          source:
            "Remotive",

          title:
            j.title,

          company:
            j.company_name,

          location:
            j.candidate_required_location ||
            "Remote",

          url:
            j.url,

          date:
            j.publication_date
              ? String(
                  j.publication_date
                ).slice(
                  0,
                  10
                )
              : null,

          salaryMin:
            null,

          salaryMax:
            null,

          salaryCurrency:
            null,

          salaryPeriod:
            null,

          level:
            null,

          description:
            stripHtml(
              `${j.salary || ""} ${j.description || ""}`
            ).slice(
              0,
              7000
            ),
        });
      }

    } catch {}
  }

  return all;
}

/* =========================================================
   DEDUPLICATE
========================================================= */

function dedupeCandidates(
  rows
) {

  const seen =
    new Set();

  const out =
    [];

  for (
    const r
    of rows
  ) {

    if (
      !r?.url ||
      !r?.title
    ) {
      continue;
    }

    const k =
      key(
        `${r.url}|${r.title}|${r.company || ""}`
      );

    if (
      seen.has(k)
    ) {
      continue;
    }

    seen.add(k);
    out.push(r);
  }

  return out;
}

/* =========================================================
   FETCH DETAILS
========================================================= */

async function enrichDetails(
  rows
) {

  const detailEligible =
    rows
      .filter(
        r =>
          /Computrabajo|El Empleo|Indeed|Magneto/i
            .test(
              r.source
            )
      )
      .slice(
        0,
        24
      );

  const results =
    await Promise.allSettled(
      detailEligible.map(
        async r => {

          try {

            const html =
              await fetchText(
                r.url,
                {},
                9000
              );

            return {
              ...r,

              description:
                stripHtml(
                  html
                ).slice(
                  0,
                  10000
                )
            };

          } catch {

            return r;
          }
        }
      )
    );

  const detailed =
    results.map(
      (x, i) =>
        x.status ===
        "fulfilled"
          ? x.value
          : detailEligible[i]
    );

  const map =
    new Map(
      detailed.map(
        r => [
          r.url,
          r
        ]
      )
    );

  return rows.map(
    r =>
      map.get(
        r.url
      ) ||
      r
  );
}

/* =========================================================
   COLLECT ALL SOURCES
========================================================= */

async function collectJobs(
  req
) {

  const variants =
    roleVariants(
      req.cargo
    );

  const tasks = [
    sourceComputrabajo(
      req,
      variants
    ),

    sourceElEmpleo(
      req,
      variants
    ),

    sourceIndeed(
      req,
      variants
    ),

    sourceMagneto(
      req,
      variants
    ),

    sourceIndeedDiscovery(
      req,
      variants
    ),

    sourceJobicy(
      req,
      variants
    ),

    sourceRemotive(
      req,
      variants
    ),
  ];

  const settled =
    await Promise.allSettled(
      tasks
    );

  let rows =
    settled
      .filter(
        x =>
          x.status ===
          "fulfilled"
      )
      .flatMap(
        x =>
          x.value
      );

  const errors =
    settled
      .filter(
        x =>
          x.status ===
          "rejected"
      )
      .map(
        x =>
          x.reason?.message ||
          "source failed"
      );

  rows =
    dedupeCandidates(
      rows
    ).slice(
      0,
      80
    );

  rows =
    await enrichDetails(
      rows
    );

  return {
    rows,
    errors,
    variants
  };
}

/* =========================================================
   JSON PARSER
========================================================= */

function parseJsonArray(
  text
) {

  const clean =
    String(
      text ||
      ""
    )
      .replace(
        /```json|```/gi,
        ""
      )
      .trim();

  const start =
    clean.indexOf(
      "["
    );

  if (
    start < 0
  ) {
    return [];
  }

  const body =
    clean.slice(
      start
    );

  const end =
    body.lastIndexOf(
      "]"
    );

  if (
    end >= 0
  ) {

    try {

      return JSON.parse(
        body.slice(
          0,
          end + 1
        )
      );

    } catch {}
  }

  const lastObject =
    body.lastIndexOf(
      "}"
    );

  if (
    lastObject >= 0
  ) {

    try {

      return JSON.parse(
        body.slice(
          0,
          lastObject + 1
        ) +
        "]"
      );

    } catch {}
  }

  return [];
}

/* =========================================================
   VARIABLE PAY TYPE
========================================================= */

function normalizeVariableType(
  type = ""
) {

  const k =
    key(
      type
    );

  if (
    k.includes(
      "comis"
    )
  ) {
    return "Comisión";
  }

  if (
    k.includes(
      "bono"
    ) ||
    k.includes(
      "bonus"
    )
  ) {
    return "Bono";
  }

  if (
    k.includes(
      "incent"
    ) ||
    k.includes(
      "meta"
    )
  ) {
    return "Incentivo";
  }

  if (
    k.includes(
      "auxil"
    ) ||
    k.includes(
      "allowance"
    )
  ) {
    return "Auxilio";
  }

  if (
    k.includes(
      "prima"
    )
  ) {
    return "Prima extralegal";
  }

  if (
    k.includes(
      "utilid"
    ) ||
    k.includes(
      "profit"
    )
  ) {
    return "Utilidades";
  }

  return "Otro";
}

/* =========================================================
   NORMALIZE OFFER
========================================================= */

function normalizeOffer(
  raw,
  req,
  country
) {

  if (
    !raw ||
    typeof raw !==
    "object"
  ) {
    return null;
  }

  const url =
    typeof raw.u ===
      "string" &&
    /^https?:\/\//i.test(
      raw.u
    )
      ? raw.u
      : null;

  if (!url) {
    return null;
  }

  const period =
    key(
      raw.per ||
      "mes"
    );

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

    hora:
      country.horas,

    hour:
      country.horas,

    hourly:
      country.horas
  })[period] || 1;

  const currency =
    String(
      raw.m ||
      country.moneda
    )
      .toUpperCase();

  const currencyFactor =
    currency ===
      country.moneda
      ? 1
      : currency ===
        "USD"
        ? country.tasa
        : null;

  const local =
    value => {

      const x =
        n(
          value
        );

      return (
        x &&
        currencyFactor
      )
        ? x *
          factor *
          currencyFactor
        : null;
    };

  let s1 =
    n(
      raw.s1
    );

  let s2 =
    n(
      raw.s2
    );

  if (
    s1 &&
    !s2
  ) {
    s2 = s1;
  }

  if (
    s2 &&
    !s1
  ) {
    s1 = s2;
  }

  const min =
    local(
      s1
    );

  const max =
    local(
      s2
    );

  const fijo =
    min &&
    max
      ? (
          min +
          max
        ) /
        2
      : null;

  const components =
    (
      Array.isArray(
        raw.vc
      )
        ? raw.vc
        : []
    )
      .filter(
        Boolean
      )
      .map(
        c => {

          const componentPeriod =
            key(
              c.per ||
              "mes"
            );

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

            hora:
              country.horas,

            hour:
              country.horas,

            hourly:
              country.horas
          })[
            componentPeriod
          ] || 1;

          let amount =
            n(
              c.a
            );

          if (
            amount &&
            currencyFactor
          ) {

            amount =
              amount *
              currencyFactor *
              componentFactor;

          } else {

            amount =
              null;
          }

          if (
            !amount &&
            n(c.pc) &&
            fijo
          ) {

            amount =
              fijo *
              n(c.pc) /
              100 /
              12;
          }

          return {
            tipo:
              normalizeVariableType(
                c.k
              ),

            monto:
              amount
          };
        }
      );

  const withAmounts =
    components.filter(
      c =>
        c.monto
    );

  const variable =
    withAmounts.length
      ? withAmounts.reduce(
          (
            sum,
            c
          ) =>
            sum +
            c.monto,
          0
        )
      : null;

  const sinMonto =
    components.length >
      0 &&
    !variable;

  const total =
    fijo &&
    !sinMonto
      ? fijo +
        (
          variable ||
          0
        )
      : null;

  const ingles =
    ENGLISH.has(
      raw.ing
    )
      ? raw.ing
      : "No especifica";

  const cargoNorm =
    key(
      req.cargo
    );

  return {
    id:
      `${cargoNorm}|${req.pais}|${url}`,

    cargo:
      cargoNorm,

    cargoTexto:
      req.cargo,

    pais:
      req.pais,

    ciudad:
      String(
        raw.c ||
        req.ciudad ||
        "Remote"
      ).trim(),

    titulo:
      raw.t ||
      "Sin título",

    rol:
      raw.r ||
      raw.t ||
      "Sin título",

    empresa:
      raw.e ||
      null,

    fuente:
      raw.f ||
      null,

    url,

    publicada:
      /^\d{4}-\d{2}-\d{2}$/
        .test(
          raw.p ||
          ""
        )
        ? raw.p
        : null,

    consultada:
      today(),

    fijo,

    variable,

    total,

    componentes:
      components,

    sinMonto,

    ingles,

    exp:
      raw.x != null &&
      Number.isFinite(
        Number(
          raw.x
        )
      )
        ? Number(
            raw.x
          )
        : null,

    educacion:
      raw.ed ||
      null,

    funciones:
      Array.isArray(
        raw.fn
      )
        ? raw.fn.slice(
            0,
            4
          )
        : [],

    requisitos:
      Array.isArray(
        raw.rq
      )
        ? raw.rq.slice(
            0,
            4
          )
        : [],

    equivalente:
      !!raw.eq,

    alerta:
      !!(
        fijo &&
        fijo <
          country.smlv *
          0.5
      ),
  };
}

/* =========================================================
   GEMINI PROMPT
========================================================= */

function promptFor(
  req,
  country,
  candidates,
  variants
) {

  const place =
    req.ciudad
      ? `${req.ciudad}, ${country.nombre}`
      : country.nombre;

  const compact =
    candidates.map(
      (
        j,
        idx
      ) => ({
        i:
          idx,

        source:
          j.source,

        title:
          j.title,

        company:
          j.company,

        location:
          j.location,

        url:
          j.url,

        date:
          j.date,

        salaryMin:
          j.salaryMin,

        salaryMax:
          j.salaryMax,

        salaryCurrency:
          j.salaryCurrency,

        salaryPeriod:
          j.salaryPeriod,

        level:
          j.level,

        description:
          j.description,
      })
    );

  return `
You are a compensation analyst.

You may NOT browse the web.

Analyze only the supplied public job records.

SEARCHED ROLE:
"${req.cargo}"

EQUIVALENT TITLES USED FOR DISCOVERY:
${variants.join(" | ")}

TARGET MARKET:
${place}

PREFERRED POSTING LANGUAGE:
${LANG[req.idioma] || "Spanish"}

IMPORTANT:

- The discovery layer searched public pages from Computrabajo, El Empleo, Indeed and Magneto when accessible, plus free remote feeds.

- Some records may be search/listing pages containing several jobs.

- Extract only identifiable vacancies supported by the supplied text.

- Do not treat jobs about "caja de compensación" or unrelated uses of the word compensation as Compensation roles.

- A comparable role must have substantially similar duties, not just one matching word.

- For city searches, prefer the city but allow country-wide remote roles clearly available in the target country.

- Preserve the actual source location.

- Never pretend a Remote job is in the selected city.

Return ONLY a JSON array.

Maximum 30 objects.

Object schema:

{
  "t": "original posting title",
  "r": "standard comparable role name",
  "e": "company or null",
  "c": "location supported by source",
  "f": "source name exactly as supplied",
  "u": "exact supplied URL",
  "p": "YYYY-MM-DD or null",
  "s1": "fixed/base salary minimum full number or null",
  "s2": "fixed/base salary maximum full number or null",
  "m": "ISO currency code or null",
  "per": "mes|año|quincena|semana|dia|hora|null",

  "vc": [
    {
      "k": "Comisión|Bono|Incentivo|Auxilio|Prima extralegal|Utilidades|Otro",
      "a": "amount or null",
      "per": "mes|año|quincena|semana|dia|hora|null",
      "pc": "annual percentage or null"
    }
  ],

  "x": "minimum years experience number or null",

  "ing": "No requerido|Básico|Intermedio|Avanzado|Bilingüe|No especifica",

  "ed": "education level or null",

  "fn": [
    "duty",
    "duty",
    "duty"
  ],

  "rq": [
    "requirement",
    "requirement"
  ],

  "eq": true
}

STRICT RULES:

- Use ONLY supplied records.

- u must equal one supplied URL exactly.

- f must equal the corresponding supplied source exactly.

- Never invent salary, employer, location, publication date, requirements or benefits.

- If salary is "confidential", "competitive", DOE, or not shown, use null.

- Do not infer English unless explicitly required.

- Do not mix salary from one vacancy with another.

- If a listing page contains multiple jobs, only extract a job when title and compensation/location can be associated confidently.

- Prefer jobs with salary.

- Then relevance.

- Then recency.

SOURCE RECORDS:

${JSON.stringify(compact)}
`;
}

/* =========================================================
   GEMINI CALL
========================================================= */

async function sleep(
  ms
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}

async function callGemini(
  model,
  req,
  env,
  candidates,
  variants
) {

  const country =
    COUNTRIES[
      req.pais
    ];

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response =
    await fetch(
      endpoint,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "x-goog-api-key":
            env.GEMINI_API_KEY,
        },

        body:
          JSON.stringify({
            contents: [
              {
                role:
                  "user",

                parts: [
                  {
                    text:
                      promptFor(
                        req,
                        country,
                        candidates,
                        variants
                      )
                  }
                ],
              }
            ],

            generationConfig: {
              maxOutputTokens:
                8192,

              responseMimeType:
                "application/json",
            },
          }),
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (
    !response.ok
  ) {

    const error =
      new Error(
        data?.error?.message ||
        `Gemini API error (${response.status})`
      );

    error.status =
      response.status;

    throw error;
  }

  const text =
    (
      data.candidates ||
      []
    )
      .flatMap(
        c =>
          c.content?.parts ||
          []
      )
      .map(
        p =>
          p.text ||
          ""
      )
      .join(
        "\n"
      );

  const parsed =
    parseJsonArray(
      text
    );

  const supplied =
    new Map(
      candidates.map(
        c => [
          c.url,
          c.source
        ]
      )
    );

  const normalized =
    parsed
      .filter(
        o =>
          supplied.has(
            o?.u
          ) &&
          supplied.get(
            o.u
          ) ===
          o.f
      )
      .map(
        o =>
          normalizeOffer(
            o,
            req,
            country
          )
      )
      .filter(
        Boolean
      );

  return {
    ofertas:
      [
        ...new Map(
          normalized.map(
            o => [
              o.id,
              o
            ]
          )
        ).values()
      ],

    model,
  };
}

/* =========================================================
   GEMINI RETRY
========================================================= */

async function analyzeWithGemini(
  req,
  env,
  candidates,
  variants
) {

  const model =
    env.GEMINI_MODEL ||
    "gemini-3.8-flash";

  let lastError;

  for (
    let attempt = 0;
    attempt < 3;
    attempt++
  ) {

    try {

      return await callGemini(
        model,
        req,
        env,
        candidates,
        variants
      );

    } catch (e) {

      lastError =
        e;

      const retryable =
        [
          429,
          500,
          502,
          503,
          504
        ]
          .includes(
            e.status
          );

      if (
        !retryable
      ) {
        break;
      }

      await sleep(
        1200 *
        (
          attempt +
          1
        )
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "Gemini is temporarily unavailable."
    )
  );
}

/* =========================================================
   WORKER
========================================================= */

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );

    /* OPTIONS */

    if (
      request.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status:
            204,

          headers: {
            "access-control-allow-origin":
              "*",

            "access-control-allow-methods":
              "POST,GET,OPTIONS",

            "access-control-allow-headers":
              "content-type",
          },
        }
      );
    }

    /* HEALTH */

    if (
      url.pathname ===
      "/api/health"
    ) {

      return json({
        ok:
          true,

        geminiConfigured:
          !!env.GEMINI_API_KEY,

        model:
          env.GEMINI_MODEL ||
          "gemini-3.8-flash",

        searchMode:
          "latam-public-portals-free",

        primarySources: [
          "Computrabajo",
          "El Empleo",
          "Indeed",
          "Magneto"
        ],

        complementarySources: [
          "Jobicy",
          "Remotive"
        ],

        googlePaidSearchUsed:
          false,

        equivalentTitleExpansion:
          true,

        retryEnabled:
          true,
      });
    }

    /* SEARCH */

    if (
      url.pathname ===
      "/api/search"
    ) {

      if (
        request.method !==
        "POST"
      ) {

        return json(
          {
            error:
              "Method not allowed."
          },
          405
        );
      }

      if (
        !env.GEMINI_API_KEY
      ) {

        return json(
          {
            error:
              "GEMINI_API_KEY is not configured in Cloudflare."
          },
          500
        );
      }

      let body;

      try {

        body =
          await request
            .json();

      } catch {

        return json(
          {
            error:
              "Invalid JSON request."
          },
          400
        );
      }

      const req = {

        cargo:
          String(
            body?.cargo ||
            ""
          )
            .trim()
            .slice(
              0,
              120
            ),

        pais:
          String(
            body?.pais ||
            ""
          )
            .trim()
            .toUpperCase(),

        ciudad:
          String(
            body?.ciudad ||
            ""
          )
            .trim()
            .slice(
              0,
              100
            ),

        idioma:
          String(
            body?.idioma ||
            "es"
          )
            .trim()
            .toLowerCase(),
      };

      if (
        req.cargo.length <
        3
      ) {

        return json(
          {
            error:
              "Enter a valid job title."
          },
          400
        );
      }

      if (
        !COUNTRIES[
          req.pais
        ]
      ) {

        return json(
          {
            error:
              "Unsupported country."
          },
          400
        );
      }

      if (
        !LANG[
          req.idioma
        ]
      ) {

        req.idioma =
          "es";
      }

      try {

        const collected =
          await collectJobs(
            req
          );

        if (
          !collected.rows.length
        ) {

          return json(
            {
              error:
                "No public vacancies could be retrieved from the free sources right now. Try again shortly or broaden the location.",

              queriesUsed:
                collected.variants,
            },
            404
          );
        }

        const result =
          await analyzeWithGemini(
            req,
            env,
            collected.rows,
            collected.variants
          );

        if (
          !result.ofertas.length
        ) {

          return json(
            {
              error:
                "Public pages returned vacancies, but none could be verified as genuinely comparable to this role. Try the whole country or another common title.",

              candidatesReviewed:
                collected.rows.length,

              queriesUsed:
                collected.variants,
            },
            404
          );
        }

        return json({
          ...result,

          searchMode:
            "latam-public-portals-free",

          candidatesReviewed:
            collected.rows.length,

          queriesUsed:
            collected.variants,

          sourceWarnings:
            collected.errors,
        });

      } catch (e) {

        return json(
          {
            error:
              e?.message ||
              "Search failed."
          },
          502
        );
      }
    }

    /* FRONTEND */

    return env.ASSETS.fetch(
      request
    );
  },
};