// Runs in the context of the job posting page.
// Always re-runs (no guard) so popup always gets fresh data, especially for SPAs
// like Workday where JS loads job content after document_idle.
(function () {
  'use strict';

  // ── US state name → abbreviation map ──────────────────────────────────────
  const US_STATE_NAMES_TO_ABBR = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR',
    'california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE',
    'florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID',
    'illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
    'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
    'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV',
    'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
    'north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT',
    'vermont':'VT','virginia':'VA','washington':'WA','west virginia':'WV',
    'wisconsin':'WI','wyoming':'WY','district of columbia':'DC',
    'puerto rico':'PR','guam':'GU','virgin islands':'VI',
  };
  const US_ABBR_SET = new Set(Object.values(US_STATE_NAMES_TO_ABBR));

  // Maps full area names (lower-case) → canonical city name.
  // Covers LinkedIn "Greater X Area" format and common city aliases.
  const CITY_ALIASES = {
    // Short aliases
    'nyc':'New York','new york city':'New York',
    'sf':'San Francisco','bay area':'San Francisco',
    'sf bay area':'San Francisco','the bay area':'San Francisco',
    'san francisco bay area':'San Francisco',
    'la':'Los Angeles',
    'dc':'Washington','washington dc':'Washington',
    'washington d.c.':'Washington','washington, d.c.':'Washington',
    // LinkedIn "Greater X Area" patterns
    'greater new york city area':'New York',
    'greater new york area':'New York',
    'new york city metropolitan area':'New York',
    'greater los angeles area':'Los Angeles',
    'los angeles metropolitan area':'Los Angeles',
    'greater chicago area':'Chicago',
    'greater seattle area':'Seattle',
    'greater boston area':'Boston',
    'greater san francisco bay area':'San Francisco',
    'greater washington dc area':'Washington',
    'greater washington d.c. area':'Washington',
    'greater philadelphia area':'Philadelphia',
    'greater denver area':'Denver',
    'greater atlanta area':'Atlanta',
    'greater miami area':'Miami',
    'greater houston area':'Houston',
    'greater dallas area':'Dallas',
    'greater austin area':'Austin',
    'greater portland area':'Portland',
    'greater minneapolis area':'Minneapolis',
    'greater detroit area':'Detroit',
    'greater phoenix area':'Phoenix',
    'greater san diego area':'San Diego',
    'greater raleigh area':'Raleigh',
    'greater charlotte area':'Charlotte',
    'greater nashville area':'Nashville',
    'greater salt lake city area':'Salt Lake City',
    'greater kansas city area':'Kansas City',
    'greater pittsburgh area':'Pittsburgh',
    'greater indianapolis area':'Indianapolis',
    'greater columbus area':'Columbus',
    'greater baltimore area':'Baltimore',
    'greater richmond area':'Richmond',
    'greater memphis area':'Memphis',
    'greater new orleans area':'New Orleans',
    'greater oklahoma city area':'Oklahoma City',
    'greater cincinnati area':'Cincinnati',
    'greater cleveland area':'Cleveland',
    'greater buffalo area':'Buffalo',
    'greater hartford area':'Hartford',
    'greater sacramento area':'Sacramento',
    'greater san jose area':'San Jose',
    'greater las vegas area':'Las Vegas',
    'greater albuquerque area':'Albuquerque',
    'greater tucson area':'Tucson',
    'greater el paso area':'El Paso',
    'greater boise area':'Boise',
    'greater omaha area':'Omaha',
    'greater milwaukee area':'Milwaukee',
    'greater louisville area':'Louisville',
    'greater birmingham area':'Birmingham',
    'greater jacksonville area':'Jacksonville',
    'greater tampa area':'Tampa',
    'greater orlando area':'Orlando',
  };

  // Labels that must never be accepted as a job title
  const GENERIC_LABELS = new Set([
    'careers','jobs','job details','job description','job posting','job listing',
    'job opening','open role','open roles','open position','open positions',
    'apply','apply now','application','apply for job','apply for this job',
    'workday','greenhouse','lever','ashby','handshake','simplify',
    'indeed','glassdoor','linkedin','wellfound','ripplematch','untapped',
    'job search','find jobs','search jobs','browse jobs','explore jobs',
    'view jobs','view all jobs','all jobs','all positions',
    'submit application','submit resume','job board',
    'employment','hiring','recruitment',
    'position details','role details','about this role','about this position',
    'back to jobs','back to careers','back to search',
    'not found','page not found','error','loading','please wait',
  ]);

  // Platform names that must never appear as a company name (full-string match)
  const PLATFORM_NOISE_RE = /^(?:linkedin|greenhouse|lever|workday|ashby|indeed|glassdoor|handshake|simplify|wellfound|angellist|angel\.co|ripplematch|untapped|ziprecruiter|monster|careerbuilder|jobs?|careers?|hiring|talent)$/i;

  // Noise suffixes/prefixes to strip from company names
  const COMPANY_SUFFIX_RE = /\s*[-|–]\s*(?:careers?|jobs?|job board|hiring|talent|apply|application|official site|linkedin|greenhouse|workday|lever|ashby|indeed|glassdoor|handshake|simplify|wellfound)\b.*/i;
  const COMPANY_PREFIX_RE = /^(?:careers?|jobs?)\s*[-|–]\s*/i;

  // ── Platform detection ─────────────────────────────────────────────────────
  function detectPlatform(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      const p = new URL(url).pathname.toLowerCase();
      if (h.includes('linkedin.com'))                                        return 'LinkedIn';
      if (h.includes('boards.greenhouse.io') || h.includes('greenhouse.io')) return 'Greenhouse';
      if (h.includes('lever.co'))                                            return 'Lever';
      if (h.includes('myworkdayjobs.com') || h.includes('workday.com'))     return 'Workday';
      if (h.includes('ashbyhq.com') || h.includes('jobs.ashby.io'))         return 'Ashby';
      if (h.includes('joinhandshake.com'))                                   return 'Handshake';
      if (h.includes('simplify.jobs'))                                       return 'Simplify';
      if (h.includes('indeed.com'))                                          return 'Indeed';
      if (h.includes('glassdoor.com'))                                       return 'Glassdoor';
      if (h.includes('github.com'))                                          return 'GitHub';
      if (h.includes('wellfound.com') || h.includes('angel.co'))            return 'Wellfound';
      if (h.includes('workatastartup.com') || h.includes('ycombinator.com')) return 'Y Combinator';
      if (h.includes('ripplematch.com'))                                     return 'RippleMatch';
      if (h.includes('untapped.io'))                                         return 'Untapped';
      if (h.startsWith('careers.') || h.startsWith('jobs.'))                return 'Company Website';
      if (p.includes('/careers') || p.includes('/jobs'))                    return 'Company Website';
      return 'Other';
    } catch (_) { return 'Other'; }
  }

  // ── URL normalization ──────────────────────────────────────────────────────
  function normalizeJobUrl(url) {
    try {
      const u = new URL(url);
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
       'ref','referer','referrer','source','trackingId','tracking_id',
       'sid','cid','currentJobId','trk','trkInfo','gh_src'].forEach(p => u.searchParams.delete(p));
      u.searchParams.sort();
      return u.origin + u.pathname + (u.search.length > 1 ? u.search : '');
    } catch (_) { return url; }
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function getText(selectors, maxLen = 200) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const t = (el.innerText || el.textContent || '').trim();
        if (t && t.length > 0 && t.length < maxLen) return t;
      } catch (_) {}
    }
    return '';
  }

  function getMeta(names) {
    for (const name of names) {
      try {
        const el = document.querySelector(`meta[name="${name}"]`) ||
                   document.querySelector(`meta[property="${name}"]`);
        if (el) { const c = (el.getAttribute('content') || '').trim(); if (c) return c; }
      } catch (_) {}
    }
    return '';
  }

  function clean(t, max = 150) {
    return t ? t.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  function isGenericLabel(text) {
    if (!text) return true;
    const lower = text.trim().toLowerCase();
    if (GENERIC_LABELS.has(lower)) return true;
    if (lower.length < 3 || lower.length > 100) return true;
    return false;
  }

  // Scan h1 first, then h2, skip nav/header/footer — return first non-generic text.
  function findBestHeading() {
    for (const tag of ['h1', 'h2']) {
      for (const el of document.querySelectorAll(tag)) {
        if (el.closest('nav, header, footer, [role="navigation"], [role="banner"]')) continue;
        const t = clean((el.innerText || el.textContent || '').trim());
        if (t && !isGenericLabel(t)) return t;
      }
    }
    return '';
  }

  // Find the text value immediately following a label element.
  // Useful for structured "Label: Value" and dl/dt/dd layouts.
  function findTextNearLabel(...labelWords) {
    try {
      const lowerWords = labelWords.map(w => w.toLowerCase());
      const els = document.querySelectorAll('dt, th, label, strong, b, h3, h4');
      for (const el of els) {
        const text = (el.innerText || el.textContent || '').replace(/[:\s]+$/, '').trim().toLowerCase();
        if (!lowerWords.includes(text)) continue;
        const next = el.nextElementSibling;
        if (next) {
          const val = (next.innerText || next.textContent || '').trim();
          if (val && val.length < 200 && val !== (el.innerText || el.textContent || '').trim())
            return val;
        }
        const parentNext = el.parentElement && el.parentElement.nextElementSibling;
        if (parentNext) {
          const val = (parentNext.innerText || parentNext.textContent || '').trim();
          if (val && val.length < 200) return val;
        }
      }
    } catch (_) {}
    return '';
  }

  // Strip noise appended to job titles.
  function cleanJobTitle(title) {
    if (!title) return '';
    let t = title.trim();
    t = t.replace(/\s*\((?:full[\s-]?time|part[\s-]?time|remote|hybrid|on[\s-]?site|in[\s-]?person|contract|intern(?:ship)?|new)\)/gi, '');
    t = t.replace(/\s*[|–—]\s*.+$/, '').trim();
    t = t.replace(/\s+at\s+[A-Z][A-Za-z0-9\s&.,'"()\-]+$/, '').trim();
    return clean(t);
  }

  // ── Company-name helpers ───────────────────────────────────────────────────
  function cleanCompanyName(name) {
    if (!name) return '';
    if (PLATFORM_NOISE_RE.test(name.trim())) return '';
    let c = name.trim()
      .replace(COMPANY_SUFFIX_RE, '')
      .replace(COMPANY_PREFIX_RE, '')
      .trim();
    if (PLATFORM_NOISE_RE.test(c)) return '';
    return clean(c) || '';
  }

  function titleCase(s) {
    if (!s) return '';
    const withSpaces = s.replace(/[-_]+/g, ' ').trim();
    // Preserve existing mixed-case (e.g. "OpenAI", "JPMorgan") but fix all-lower and all-upper
    if (withSpaces !== withSpaces.toLowerCase() && withSpaces !== withSpaces.toUpperCase()) {
      return withSpaces;
    }
    return withSpaces.replace(/\b\w/g, c => c.toUpperCase());
  }

  function extractCompanyFromUrl(url) {
    try {
      const u     = new URL(url);
      const h     = u.hostname.toLowerCase();
      const parts = u.pathname.split('/').filter(Boolean);

      // company.wd1.myworkdayjobs.com → "Company"
      const wdMatch = h.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i);
      if (wdMatch) return titleCase(wdMatch[1].replace(/-/g, ' '));

      // careers.company.com or jobs.company.com
      if (/^(?:careers|jobs)\./.test(h))
        return titleCase(h.replace(/^(?:careers|jobs)\./, '').split('.')[0]);

      // company.greenhouse.io
      if (h.match(/^[^.]+\.greenhouse\.io$/))
        return titleCase(h.split('.')[0]);

      // boards.greenhouse.io/company
      if (h.includes('greenhouse.io') && parts[0]) return titleCase(parts[0]);

      // jobs.ashbyhq.com/company or app.ashbyhq.com/company
      if (h.includes('ashbyhq.com') && parts[0]) return titleCase(parts[0]);

      // jobs.lever.co/company
      if (h.includes('lever.co') && parts[0]) return titleCase(parts[0]);
    } catch (_) {}
    return '';
  }

  // ── Location helpers ───────────────────────────────────────────────────────
  function abbreviateState(input) {
    if (!input) return '';
    const upper = input.trim().toUpperCase();
    if (US_ABBR_SET.has(upper)) return upper;
    return US_STATE_NAMES_TO_ABBR[input.trim().toLowerCase()] || '';
  }

  function normalizeCity(city) {
    return CITY_ALIASES[city.trim().toLowerCase()] || city.trim();
  }

  function parseUSLocation(text) {
    if (!text) return '';
    let t = text.trim()
      .replace(/,?\s*(?:united states(?: of america)?|usa?)\s*$/i, '')
      .trim();
    if (!t) return '';

    // "City, ST" or "City, ST, ..."
    const m1 = t.match(/^([A-Za-zÀ-ɏ\s.'`\-]+?),\s*([A-Za-z]{2})(?:\s*[,\-–].*)?$/);
    if (m1) {
      const abbr = m1[2].toUpperCase();
      if (US_ABBR_SET.has(abbr)) {
        const city = normalizeCity(m1[1]);
        return isGenericLabel(city) ? '' : `${city}, ${abbr}`;
      }
    }

    // "City, Full State Name" or "City, Full State Name, ..."
    const m2 = t.match(/^([A-Za-zÀ-ɏ\s.'`\-]+?),\s*([A-Za-z][A-Za-z\s]+?)(?:\s*,.*)?$/);
    if (m2) {
      const abbr = abbreviateState(m2[2].trim());
      if (abbr) {
        const city = normalizeCity(m2[1]);
        return isGenericLabel(city) ? '' : `${city}, ${abbr}`;
      }
    }

    // "City ST" — no comma, two-letter abbreviation at end
    const m3 = t.match(/^([A-Za-zÀ-ɏ\s.'`\-]+?)\s+([A-Z]{2})$/);
    if (m3) {
      const abbr = m3[2];
      if (US_ABBR_SET.has(abbr)) {
        const city = normalizeCity(m3[1]);
        return isGenericLabel(city) ? '' : `${city}, ${abbr}`;
      }
    }

    return '';
  }

  const REMOTE_RE = /^(?:remote|anywhere|worldwide|distributed|virtual|work[\s-]?from[\s-]?home|wfh|fully\s+remote)$/i;

  // Returns { location: string, notes: string }
  function normalizeLocation(raw) {
    if (!raw) return { location: '', notes: '' };
    let t = raw.trim();

    // ── Step 1: extract trailing "(Hybrid)" / "(Remote)" / "(On-site)" in parens ──
    // Handles: "New York, NY (Hybrid)", "San Francisco, CA (Remote)"
    let workModeFromParens = '';
    const workModeParenRe = /\s*[\(\[]\s*(hybrid|remote|on[\s-]?site|in[\s-]?person|work[\s-]?from[\s-]?home|wfh)\s*[\)\]].*$/i;
    const parenMatch = t.match(workModeParenRe);
    if (parenMatch) {
      workModeFromParens = parenMatch[1].toLowerCase();
      t = t.replace(workModeParenRe, '').trim();
    }

    // ── Step 2: check full-string CITY_ALIASES (handles LinkedIn area names) ──
    // e.g. "Greater New York City Area", "SF Bay Area", "NYC"
    const alias = CITY_ALIASES[t.toLowerCase()];
    if (alias) {
      const notes = workModeFromParens === 'hybrid' ? 'Hybrid' : '';
      return { location: alias, notes };
    }

    // ── Step 3: on-site / in-person (no location info) ──
    if (/^(?:on[\s-]?site|in[\s-]?person)$/i.test(t)) return { location: '', notes: '' };

    // ── Step 4: fully remote ──
    if (REMOTE_RE.test(t)) return { location: 'Remote', notes: '' };

    // "Remote (US)", "Remote (Anywhere)", "Remote [Global]", "Remote/US"
    if (/^remote\s*[\(\[\/]/i.test(t)) return { location: 'Remote', notes: '' };

    // "Remote, US" / "Remote - United States" / "Remote – Anywhere"
    if (/^remote\s*(?:[-–,]\s*(?:united states(?: of america)?|usa?|anywhere|worldwide|global|country-wide|nationwide))?$/i.test(t))
      return { location: 'Remote', notes: '' };

    // "Remote - City, ST" (rare but valid)
    if (/^(?:remote|work[\s-]?from[\s-]?home|virtual)\s*[-–,]\s*/i.test(t)) {
      const rest = t.replace(/^(?:remote|work[\s-]?from[\s-]?home|virtual)\s*[-–,]\s*/i, '').trim();
      if (!rest || /^(?:united states|usa?|anywhere|worldwide|global)$/i.test(rest))
        return { location: 'Remote', notes: '' };
      return { location: parseUSLocation(rest) || 'Remote', notes: '' };
    }

    // ── Step 5: hybrid ──
    if (/^hybrid\s*[-–,]\s*/i.test(t)) {
      const rest = t.replace(/^hybrid\s*[-–,]\s*/i, '').trim();
      return { location: parseUSLocation(rest) || '', notes: 'Hybrid' };
    }
    // "Hybrid (City, ST)" — parens after hybrid
    if (/^hybrid\s*[\(\[]/i.test(t)) {
      const inner = t.replace(/^hybrid\s*[\(\[]\s*/i, '').replace(/[\)\]]\s*$/, '').trim();
      return { location: parseUSLocation(inner) || '', notes: 'Hybrid' };
    }
    if (/^hybrid$/i.test(t)) return { location: '', notes: 'Hybrid' };

    // Apply any work-mode extracted from trailing parens
    if (workModeFromParens === 'hybrid') {
      const loc = parseUSLocation(t) || '';
      return { location: loc, notes: 'Hybrid' };
    }
    if (/^(?:remote|work[\s-]?from[\s-]?home)$/i.test(workModeFromParens)) {
      return { location: 'Remote', notes: '' };
    }

    // ── Step 6: on-site with location ──
    if (/^on[\s-]?site\s*[-–,]/i.test(t)) {
      const rest = t.replace(/^on[\s-]?site\s*[-–,]\s*/i, '').trim();
      return { location: parseUSLocation(rest) || '', notes: '' };
    }

    // ── Step 7: multiple locations — take first parseable US location ──
    if (/^multiple\s+locations?$/i.test(t)) return { location: '', notes: '' };
    const multiMatch = t.match(/^(?:multiple\s+locations?[:\s]+)(.+)$/i);
    if (multiMatch) return normalizeLocation(multiMatch[1]);

    if (/[;/|]/.test(t)) {
      for (const part of t.split(/\s*[;/|]\s*/)) {
        const trimmed = part.trim();
        if (REMOTE_RE.test(trimmed)) return { location: 'Remote', notes: '' };
        const loc = parseUSLocation(trimmed);
        if (loc) return { location: loc, notes: '' };
      }
      return { location: '', notes: '' };
    }

    // ── Step 8: plain location string ──
    return { location: parseUSLocation(t) || '', notes: '' };
  }

  // ── Salary helpers ─────────────────────────────────────────────────────────
  const SALARY_CONTEXT_RE = /salary|compensation|pay\b|wage|stipend|hourly|annual(?:ly)?|\/hr\b|\/year\b|\/yr\b|per hour|per year|a year|an hour|\$[\d]/i;
  const FALSE_POSITIVE_RE = /(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)|job\s+id|posting\s+id|req(?:uisition)?\s*(?:id|#|num)|^\d{4}\s+(?:internship|job|role)|posted\s+\d+\s+(?:days?|hours?|weeks?)/i;

  function normalizeSalary(raw) {
    if (!raw) return '';
    if (FALSE_POSITIVE_RE.test(raw)) return '';

    const isHourly = /per hour|\/hr\b|\/hour\b|\bhourly\b|an hour|per hr/i.test(raw);
    const isAnnual = /per year|\/year\b|\/yr\b|\bannual(?:ly)?\b|a year|per annum/i.test(raw);

    const amounts = [];
    const dollarRe = /\$\s*([\d,]+(?:\.[\d]+)?)\s*([kK])?/g;
    let m;
    while ((m = dollarRe.exec(raw)) !== null) {
      let v = parseFloat(m[1].replace(/,/g, ''));
      if (m[2]) v *= 1000;
      if (v > 0) amounts.push(v);
    }

    // k-suffix fallback: only when text has salary context keywords
    if (amounts.length === 0 && SALARY_CONTEXT_RE.test(raw)) {
      const kRe = /\b([\d]+(?:\.[\d]+)?)\s*[kK]\b/g;
      while ((m = kRe.exec(raw)) !== null) {
        const v = parseFloat(m[1]) * 1000;
        if (v >= 15000 && v <= 500000) amounts.push(v);
      }
    }

    if (amounts.length === 0) return '';

    const max = Math.max(...amounts);
    const fmtHr = n => `$${n % 1 === 0 ? n : n.toFixed(2)}/hr`;
    const fmtYr = n => `$${Math.round(n).toLocaleString()}/year`;

    if (isHourly)                 return fmtHr(max);
    if (isAnnual || max >= 10000) return fmtYr(max);
    if (max <= 300)               return fmtHr(max);
    return fmtYr(max);
  }

  function formatJsonLdSalary(bs) {
    if (!bs) return '';
    const cur = (bs.currency === 'USD' || !bs.currency) ? '$' : (bs.currency + ' ');
    const v   = bs.value || {};
    const unit = (v.unitText || '').toUpperCase();
    const isHr = unit === 'HOUR';
    const fmt  = n => {
      const num = parseFloat(n);
      return isHr ? `${cur}${num % 1 === 0 ? num : num.toFixed(2)}/hr`
                  : `${cur}${Math.round(num).toLocaleString()}/year`;
    };
    if (v.maxValue) return fmt(v.maxValue);
    if (v.minValue) return fmt(v.minValue);
    if (v.value)    return fmt(v.value);
    return '';
  }

  // ── Job-type helpers ───────────────────────────────────────────────────────
  function extractJobTypeFromTitle(title) {
    if (!title) return '';
    if (/\bco[\s\-]?op\b/i.test(title))    return 'Co-op';
    if (/\bintern(?:ship)?\b/i.test(title)) return 'Internship';
    if (/\bfellow(?:ship)?\b/i.test(title)) return 'Fellowship';
    return '';
  }

  function mapJobType(str) {
    if (!str) return '';
    if (/\bco[\s\-]?op\b/i.test(str))                               return 'Co-op';
    if (/\bintern(?:ship)?\b/i.test(str))                            return 'Internship';
    if (/\bfull[\s\-]?time\b|\bpermanent\b|\bregular\b/i.test(str)) return 'Full-time';
    if (/\bpart[\s\-]?time\b/i.test(str))                           return 'Part-time';
    if (/\bcontract(?:or)?\b|\bfreelance\b/i.test(str))             return 'Contract';
    if (/\bfellow(?:ship)?\b/i.test(str))                           return 'Fellowship';
    if (/\btemp(?:orar(?:y|ily))?\b|\bseasonal\b/i.test(str))      return 'Temporary';
    if (/\bresearch\b/i.test(str))                                   return 'Research';
    return '';
  }

  // ── Parse "Role at Company" / "Company | Role" page-title formats ──────────
  function parseTitleString(title) {
    if (!title) return { jobTitle: '', companyName: '' };

    const atMatch = title.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|–\-].*)?$/i);
    if (atMatch) {
      const role = clean(atMatch[1]);
      const co   = cleanCompanyName(clean(atMatch[2].split(/[|–]/)[0]));
      if (!isGenericLabel(role)) return { jobTitle: role, companyName: co };
    }

    const segs = title.split(/\s*[|–—]\s*|\s{2,}-\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (segs.length >= 2) {
      for (const seg of segs) {
        if (!isGenericLabel(seg)) return { jobTitle: clean(seg), companyName: '' };
      }
    }

    const seg = clean(title.split(/\s*[|–]\s*/)[0].split(/\s+-\s+/)[0]);
    return { jobTitle: isGenericLabel(seg) ? '' : seg, companyName: '' };
  }

  // ── Strategy A: JSON-LD ────────────────────────────────────────────────────
  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent || '{}');
        const candidates = Array.isArray(raw) ? raw
          : raw['@graph'] ? raw['@graph'] : [raw];
        for (const schema of candidates) {
          // @type can be a string or an array like ["JobPosting", "Thing"]
          const types = [].concat(schema['@type'] || []);
          if (!types.includes('JobPosting')) continue;

          const r = {};
          if (schema.title)                    r.jobTitle    = clean(schema.title);
          if (schema.hiringOrganization?.name) r.companyName = cleanCompanyName(clean(schema.hiringOrganization.name));
          if (schema.validThrough)             r.deadline    = schema.validThrough.split('T')[0];
          if (schema.employmentType) {
            const et = Array.isArray(schema.employmentType)
              ? schema.employmentType[0] : schema.employmentType;
            r.jobType = mapJobType(et);
          }
          if (schema.jobLocationType === 'TELECOMMUTE') {
            r.location = 'Remote';
          } else if (schema.jobLocation) {
            const locs = Array.isArray(schema.jobLocation)
              ? schema.jobLocation : [schema.jobLocation];
            let bestLoc = '';
            for (const l of locs) {
              const a       = l.address || l || {};
              const country = (a.addressCountry || '').toUpperCase();
              if (country && country !== 'US' && country !== 'USA' && country !== 'UNITED STATES') continue;
              const combined = [a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
              const parsed   = parseUSLocation(combined);
              if (parsed) { bestLoc = parsed; break; }
              if (combined) bestLoc = combined;
            }
            if (!bestLoc && locs.length) {
              const a = (locs[0].address || locs[0]) || {};
              bestLoc = [a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
            }
            if (bestLoc) r.location = bestLoc;
          }
          r.salary = formatJsonLdSalary(schema.baseSalary);
          return r;
        }
      } catch (_) {}
    }
    return {};
  }

  // ── Strategy B: Meta tags ──────────────────────────────────────────────────
  function extractFromMetaTags() {
    const r = {};
    const title = getMeta(['og:title', 'twitter:title']);
    if (title) {
      const p = parseTitleString(title);
      if (p.jobTitle && !isGenericLabel(p.jobTitle)) r.jobTitle    = p.jobTitle;
      if (p.companyName)                              r.companyName = p.companyName;
    }
    const site = getMeta(['og:site_name', 'application-name']);
    if (site) r.companyName = r.companyName || cleanCompanyName(clean(site));
    return r;
  }

  // ── Strategy C: Platform-specific extractors ───────────────────────────────

  function extractLinkedInJob() {
    const r = {};
    r.jobTitle = clean(getText([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      'h1.t-24.t-bold', 'h1[class*="job-title"]', 'h1',
    ]));
    r.companyName = cleanCompanyName(clean(getText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '[class*="topcard__org-name-link"]',
    ])));

    // LinkedIn format: "City, ST · Work Mode" — capture both halves
    const locRaw = clean(getText([
      '.job-details-jobs-unified-top-card__primary-description-container .t-black--light',
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '[class*="topcard__flavor--bullet"]',
    ]));
    if (locRaw) {
      const parts = locRaw.split(/\s*[·•]\s*/);
      r.location = parts[0].trim();
      if (parts.length > 1) {
        const mode = parts[1].trim();
        if (/hybrid/i.test(mode))                          r.notes = 'Hybrid';
        else if (/^remote$/i.test(mode))                   r.location = 'Remote';
        else if (/work[\s-]?from[\s-]?home|wfh/i.test(mode)) r.location = 'Remote';
      }
    }

    const salRaw = clean(getText([
      '.job-details-jobs-unified-top-card__job-insight--highlight span',
      '[class*="salary"]',
    ]));
    if (salRaw && /[\$£€¥₹]|\d[\d,]+[kK]?/.test(salRaw)) r.salary = salRaw;
    return r;
  }

  function extractGreenhouseJob() {
    const urlCo  = extractCompanyFromUrl(window.location.href);
    const domCo  = cleanCompanyName(clean(getText(['.company-name', '#header .company-name'])));
    const metaCo = cleanCompanyName(clean(getMeta(['og:site_name'])));
    return {
      jobTitle:    clean(getText(['.app-title', 'h1.section-header', '#header h1', '.job-title', 'h1'])),
      companyName: domCo || metaCo || urlCo,
      location:    clean(getText(['.location', '#header .location', '.job-location', '#location'])),
      jobType:     mapJobType(getText(['.commitment', '.employment-type', '#employment-type'])),
    };
  }

  function extractLeverJob() {
    const urlCo  = extractCompanyFromUrl(window.location.href);
    const metaCo = cleanCompanyName(clean(getMeta(['og:site_name'])));
    return {
      jobTitle:    clean(getText(['.posting-headline h2', '.job-title', 'h2[class*="posting"]', 'h2', 'h1'])),
      companyName: urlCo || metaCo,
      location:    clean(getText([
        '.posting-categories .sort-by-location',
        '.posting-categories .location',
        '[class*="location"]', '.location',
      ])),
      jobType:     mapJobType(getText(['.posting-categories .sort-by-commitment', '.commitment'])),
    };
  }

  function extractWorkdayJob() {
    // Company: data-automation-id first, then header img alt, then og:site_name, then URL subdomain
    const domCo = cleanCompanyName(clean(getText([
      '[data-automation-id="company-name"]',
      '[data-automation-id="company"]',
    ])));

    const metaCo = cleanCompanyName(clean(getMeta(['og:site_name'])));
    const urlCo  = extractCompanyFromUrl(window.location.href);

    // Title: use specific automation-id; avoid generic h2[data-automation-id] (too broad)
    const jobTitle = clean(getText([
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="heading"]',
      'h1[class*="css-"]',
      'h1',
    ]));

    // Location: try many Workday-specific patterns
    const locationCandidates = [
      getText([
        '[data-automation-id="locations"]',
        '[data-automation-id="location"]',
        '[data-automation-id="locationSection"]',
        '[data-automation-id="location-section"]',
        '[data-automation-id="primaryLocation"]',
        '[data-automation-id="primary-location"]',
      ]),
      (() => {
        // Wildcard: any automation-id containing "ocation"
        try {
          const els = document.querySelectorAll('[data-automation-id*="ocation"]');
          for (const el of els) {
            const t = (el.innerText || el.textContent || '').trim();
            if (t && t.length < 200) return t;
          }
        } catch (_) {}
        return '';
      })(),
      findTextNearLabel('Location', 'Primary Location', 'Locations', 'Job Location'),
      getText(['[class*="location"]']),
    ];
    const location = locationCandidates.find(l => l && l.trim()) || '';

    const salaryRaw = getText([
      '[data-automation-id="salary"]',
      '[data-automation-id="pay"]',
      '[data-automation-id="compensation"]',
      '[data-automation-id="pay-range"]',
      '[data-automation-id="salaryRange"]',
      '[class*="salary"]', '[class*="compensation"]',
    ]);

    // Company: try img alt text from header/nav (strip " Logo"/" Icon" suffix to avoid noise)
    let companyName = domCo;
    if (!companyName) {
      try {
        const imgs = document.querySelectorAll('header img[alt], nav img[alt], [class*="header"] img[alt]');
        for (const img of imgs) {
          const alt = (img.getAttribute('alt') || '')
            .replace(/\s+(?:logo|icon|image|img|badge|mark)$/i, '')
            .trim();
          const cleaned = cleanCompanyName(alt);
          if (cleaned) { companyName = cleaned; break; }
        }
      } catch (_) {}
    }
    if (!companyName) companyName = metaCo;
    if (!companyName) companyName = urlCo;

    return {
      jobTitle,
      companyName,
      location,
      salary: salaryRaw && SALARY_CONTEXT_RE.test(salaryRaw) ? salaryRaw : '',
      jobType: mapJobType(getText([
        '[data-automation-id="time"]',
        '[data-automation-id="jobType"]',
        '[data-automation-id="scheduledHours"]',
      ])),
    };
  }

  function extractAshbyJob() {
    const urlCo  = extractCompanyFromUrl(window.location.href);
    const metaCo = cleanCompanyName(clean(getMeta(['og:site_name'])));
    const domCo  = cleanCompanyName(clean(getText([
      '[class*="CompanyName"]','[class*="company-name"]','[class*="company"]',
    ])));
    return {
      jobTitle: clean(getText([
        'h1[class*="ashby"]', '.ashby-job-posting-top-card h1',
        'h1[class*="Title"]', 'h1[class*="title"]', 'h1',
      ])),
      companyName: domCo || metaCo || urlCo,
      location: clean(getText([
        '[class*="Location"]','[class*="location"]','[class*="JobLocation"]',
      ])),
      jobType: mapJobType(getText([
        '[class*="Employment"]','[class*="employment"]',
        '[class*="JobType"]','[class*="type"]',
      ])),
    };
  }

  function extractHandshakeJob() {
    return {
      jobTitle: clean(getText([
        'h1[class*="job"]','h1[class*="title"]','.job-details h1','.posting-title','h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[class*="employer-name"]','[class*="company-name"]',
        '[class*="employerName"]','[class*="companyName"]',
      ]))),
      location: clean(getText([
        '[class*="job-location"]','[class*="jobLocation"]','[class*="location"]',
      ])),
      jobType: mapJobType(getText([
        '[class*="job-type"]','[class*="jobType"]','[class*="employment"]',
      ])),
    };
  }

  function extractSimplifyJob() {
    const domCo  = cleanCompanyName(clean(getText([
      '[class*="company"]','[class*="employer"]','[class*="CompanyName"]',
    ])));
    const metaCo = cleanCompanyName(clean(getMeta(['og:site_name'])));
    return {
      jobTitle: clean(getText([
        'h1[class*="job"]','h1[class*="title"]','h1[class*="role"]',
        '[class*="jobTitle"]','[class*="job-title"]','h1',
      ])),
      companyName: domCo || metaCo,
      location: clean(getText(['[class*="location"]','[class*="Location"]'])),
      jobType:  mapJobType(getText(['[class*="job-type"]','[class*="jobType"]','[class*="type"]'])),
    };
  }

  function extractIndeedJob() {
    return {
      jobTitle: clean(getText([
        '[data-testid="jobsearch-JobInfoHeader-title"] span',
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        'h1.jobsearch-JobInfoHeader-title',
        '.jobsearch-JobInfoHeader-title', 'h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[data-testid="inlineHeader-companyName"] a',
        '[data-testid="inlineHeader-companyName"]',
        '.jobsearch-InlineCompanyRating-companyHeader a',
        '[class*="companyName"]',
      ]))),
      location: clean(getText([
        '[data-testid="job-location"]',
        '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
        '[class*="location"]',
      ])),
      salary: clean(getText([
        '[data-testid="attribute_snippet_testid"]',
        '.salary-snippet-container',
        '[id="salaryInfoAndJobType"] span',
        '[class*="salary"]',
      ])),
      jobType: mapJobType(getText(['[class*="metadata"] [class*="attribute"]','[class*="job-type"]'])),
    };
  }

  function extractGlassdoorJob() {
    return {
      jobTitle: clean(getText([
        '[data-test="job-title"]','h1[class*="job"]','[class*="jobTitle"]','h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[data-test="employer-name"]','[class*="employer"]','[class*="employerName"]',
      ]))),
      location: clean(getText([
        '[data-test="location"]','[class*="location"]','[class*="Location"]',
      ])),
      salary: clean(getText([
        '[data-test="detailSalary"]','[class*="salary"]','[class*="Salary"]',
      ])),
    };
  }

  function extractWellfoundJob() {
    return {
      jobTitle: clean(getText([
        'h1[class*="title"]','h1[class*="role"]','.job-info h1','[class*="jobTitle"]','h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[class*="startup-link"]','[class*="startup_link"]',
        '[class*="company-name"]','[class*="companyName"]',
      ]))),
      location: clean(getText([
        '[class*="job-location"]','[class*="jobLocation"]','[class*="location"]',
      ])),
      salary: clean(getText(['[class*="compensation"]','[class*="salary"]','[class*="pay"]'])),
    };
  }

  function extractYCJob() {
    return {
      jobTitle: clean(getText(['h1[class*="title"]','h1[class*="role"]','.job-title','h1'])),
      companyName: cleanCompanyName(clean(getText([
        '.company-name','a[class*="company"]','[class*="company-link"]','[class*="companyName"]',
      ]))),
      location: clean(getText([
        '[class*="job-location"]','[class*="location"]','[class*="Location"]',
      ])),
    };
  }

  function extractRippleMatchJob() {
    return {
      jobTitle: clean(getText([
        'h1[class*="title"]','[class*="job-title"]','[class*="jobTitle"]','h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[class*="company"]','[class*="employer"]','[class*="Company"]',
      ]))),
      location: clean(getText(['[class*="location"]','[class*="Location"]'])),
    };
  }

  function extractUntappedJob() {
    return {
      jobTitle: clean(getText([
        'h1[class*="role"]','h1[class*="title"]','[class*="jobTitle"]','h1',
      ])),
      companyName: cleanCompanyName(clean(getText([
        '[class*="company"]','[class*="employer"]',
      ]))),
      location: clean(getText(['[class*="location"]','[class*="Location"]'])),
    };
  }

  function extractGitHubJob() {
    return {
      jobTitle: clean(getText([
        'h1[class*="job-title"]','[itemprop="title"]','h1',
      ])),
      companyName: cleanCompanyName(clean(getMeta(['og:site_name']))) || 'GitHub',
      location: clean(getText([
        '[class*="location"]','[itemprop="addressLocality"]','[class*="Location"]',
      ])),
    };
  }

  // ── Strategy D: Generic fallback ───────────────────────────────────────────
  function extractGenericJob() {
    const r = {};

    r.jobTitle = clean(getText([
      '[itemprop="title"]',
      'h1[class*="job"]','h1[class*="title"]','h1[class*="position"]','h1[class*="role"]',
    ]));
    if (!r.jobTitle || isGenericLabel(r.jobTitle)) r.jobTitle = findBestHeading();
    if (!r.jobTitle) {
      const p = parseTitleString(document.title);
      r.jobTitle    = p.jobTitle;
      r.companyName = p.companyName;
    }

    r.companyName = r.companyName || cleanCompanyName(clean(getText([
      '[itemprop="hiringOrganization"] [itemprop="name"]',
      '[class*="company-name"]','[class*="company_name"]','[class*="companyName"]',
      '[class*="employer"]','[class*="organization"]',
    ])));
    r.location = clean(getText([
      '[itemprop="jobLocation"] [itemprop="name"]','[itemprop="addressLocality"]',
      '[class*="location"]','[class*="job-location"]','[class*="jobLocation"]',
    ]));
    if (!r.location) r.location = findTextNearLabel('Location', 'Job Location', 'Primary Location');

    r.salary = clean(getText([
      '[itemprop="baseSalary"]',
      '[class*="salary"]','[class*="compensation"]','[class*="pay"]',
    ]));
    if (!r.salary) r.salary = findTextNearLabel('Salary', 'Pay', 'Compensation', 'Base Pay', 'Pay Range');

    r.jobType = mapJobType(getText([
      '[itemprop="employmentType"]',
      '[class*="employment-type"]','[class*="employmentType"]',
      '[class*="job-type"]','[class*="jobType"]',
    ]));
    return r;
  }

  // ── Main: merge all strategies ─────────────────────────────────────────────
  const href     = window.location.href;
  const platform = detectPlatform(href);

  const jsonLdData = extractFromJsonLd();
  const metaData   = extractFromMetaTags();

  let platformData = {};
  switch (platform) {
    case 'LinkedIn':     platformData = extractLinkedInJob();    break;
    case 'Greenhouse':   platformData = extractGreenhouseJob();  break;
    case 'Lever':        platformData = extractLeverJob();       break;
    case 'Workday':      platformData = extractWorkdayJob();     break;
    case 'Ashby':        platformData = extractAshbyJob();       break;
    case 'Handshake':    platformData = extractHandshakeJob();   break;
    case 'Simplify':     platformData = extractSimplifyJob();    break;
    case 'Indeed':       platformData = extractIndeedJob();      break;
    case 'Glassdoor':    platformData = extractGlassdoorJob();   break;
    case 'GitHub':       platformData = extractGitHubJob();      break;
    case 'Wellfound':    platformData = extractWellfoundJob();   break;
    case 'Y Combinator': platformData = extractYCJob();          break;
    case 'RippleMatch':  platformData = extractRippleMatchJob(); break;
    case 'Untapped':     platformData = extractUntappedJob();    break;
    default:             platformData = extractGenericJob();     break;
  }

  // JSON-LD is most authoritative; platform fills gaps; meta fills remaining.
  const merged = Object.assign({}, jsonLdData);
  for (const [k, v] of Object.entries(platformData)) { if (v && !merged[k]) merged[k] = v; }
  for (const [k, v] of Object.entries(metaData))     { if (v && !merged[k]) merged[k] = v; }

  // ── Post-processing ────────────────────────────────────────────────────────

  // 1. Last-resort job title from page title
  if (!merged.jobTitle || isGenericLabel(merged.jobTitle)) {
    const p = parseTitleString(document.title);
    if (p.jobTitle && !isGenericLabel(p.jobTitle)) {
      merged.jobTitle = p.jobTitle;
      if (p.companyName && !merged.companyName) merged.companyName = p.companyName;
    }
  }

  // 2. Final heading scan fallback
  if (!merged.jobTitle || isGenericLabel(merged.jobTitle)) {
    merged.jobTitle = findBestHeading();
  }

  // 3. Strip noise from job title
  if (merged.jobTitle) merged.jobTitle = cleanJobTitle(merged.jobTitle);

  // 4. Job-type override from title keyword (always wins)
  const titleType = extractJobTypeFromTitle(merged.jobTitle || '');
  if (titleType) merged.jobType = titleType;

  // 5. Normalize location → { location, notes }
  const { location: normLoc, notes: workModeNote } = normalizeLocation(merged.location || '');
  merged.location = normLoc;
  if (workModeNote && !merged.notes) merged.notes = workModeNote;

  // 6. Normalize salary (skip if already formatted by formatJsonLdSalary)
  if (merged.salary && !/\/(?:hr|hour|year|yr)\b/.test(merged.salary)) {
    merged.salary = normalizeSalary(merged.salary) || '';
  }

  // 7. Clean company name
  merged.companyName = cleanCompanyName(merged.companyName || '');

  // 8. Last-resort company from URL
  if (!merged.companyName) merged.companyName = extractCompanyFromUrl(href);

  window.__jobTrackerData = {
    jobTitle:      merged.jobTitle      || '',
    companyName:   merged.companyName   || '',
    location:      merged.location      || '',
    salary:        merged.salary        || '',
    deadline:      merged.deadline      || '',
    jobType:       merged.jobType       || '',
    notes:         merged.notes         || '',
    platform:      platform,
    normalizedUrl: normalizeJobUrl(href),
  };

})();
