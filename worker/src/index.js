const FEEDS = [
  ['https://www.theregister.com/headlines.atom', 'uk'],
  ['https://www.bbc.co.uk/news/technology/rss.xml', 'uk'],
  ['https://www.bleepingcomputer.com/feed/', 'us'],
  ['https://www.vice.com/en/topic/technology/rss', 'us'],
  ['https://www.theverge.com/rss/index.xml', 'us'],
  ['https://www.techradar.com/uk/rss', 'uk'],
  ['https://www.euronews.com/rss?level=theme&name=technology', 'eu'],
  ['https://www.wired.com/feed/tag/security/latest/rss', 'us'],
  ['https://feeds.arstechnica.com/arstechnica/technology-lab', 'us'],
  ['https://www.zdnet.com/topic/security/rss.xml', 'us'],
];

const REGION_WEIGHTS = { uk: 2, eu: 2, us: 1 };
const COMMON_KEYWORDS = ['outage', 'breach', 'down', 'fail', 'bug', 'hack', 'steal', 'stolen', 'error', 'scam', 'fraud', 'leak', 'crash', 'ransomware', 'bank', 'glitch'];
const POLITICAL_TERMS = ['election', 'parliament', 'senate', 'white house', 'downing street', 'campaign', 'vote', 'voted', 'ballot', 'minister', 'president', 'prime minister', 'politic', 'lawmaker', 'congress', 'referendum', 'party leader'];
const MAJOR_TECH_TERMS = ['microsoft', 'windows', 'azure', 'google', 'alphabet', 'android', 'chrome', 'apple', 'iphone', 'macbook', 'amazon', 'aws', 'meta', 'facebook', 'instagram', 'whatsapp', 'openai', 'nvidia', 'tesla', 'broadcom', 'oracle', 'salesforce', 'cloudflare', 'cisco', 'ibm', 'dell', 'hp', 'intel', 'arm', 'vodafone', 'bt', 'virgin media', 'sky broadband', 'uk government', 'national cyber security centre', 'nhs', 'lloyds', 'barclays', 'hsbc', 'natwest', 'shell', 'bp'];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      env.__REQUEST_ORIGIN = request.headers.get('Origin') || '';

      if (url.pathname.startsWith('/api/')) {
        if (request.method === 'OPTIONS') {
          return buildCorsResponse(env, 204, env.__REQUEST_ORIGIN);
        }
        return await handleApiRequest(request, env, url);
      }

      // Legacy approval links fall back to signed query handling
      if (url.searchParams.has('action')) {
        return await handleLegacyApproval(url, env);
      }

      return jsonResponse(env, { ok: true, message: 'Daily IT Console Worker' }, 200, env.__REQUEST_ORIGIN);
    } catch (error) {
      console.error('Worker error', error);
      return jsonResponse(env, { error: 'Internal Server Error' }, 500, env.__REQUEST_ORIGIN);
    }
  }
};

async function handleApiRequest(request, env, url) {
  switch (url.pathname) {
    case '/api/login':
      return await handleLogin(request, env);
    case '/api/articles':
      await requireAuth(request, env);
      return await handleArticles(env, url);
    case '/api/jobs':
      await requireAuth(request, env);
      if (request.method !== 'POST') return jsonResponse(env, { error: 'Method not allowed' }, 405);
      return await handleJobStart(request, env);
    default:
      if (url.pathname.startsWith('/api/jobs/')) {
        await requireAuth(request, env);
        return await handleJobSubRoutes(request, env, url);
      }
      return jsonResponse(env, { error: 'Not found' }, 404);
  }
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(env, { error: 'Method not allowed' }, 405);
  }

  const { username, password } = await safeJson(request, {});
  if (!username || !password) {
    return jsonResponse(env, { error: 'Missing credentials' }, 400);
  }

  if (username !== env.CONSOLE_USERNAME || password !== env.CONSOLE_PASSWORD) {
    return jsonResponse(env, { error: 'Invalid credentials' }, 401);
  }

  const expiresAt = Date.now() + 60 * 60 * 1000;
  const token = await createToken({ sub: username, exp: expiresAt }, env.CONSOLE_JWT_SECRET);
  return jsonResponse(env, { token, expiresAt });
}

async function handleArticles(env, url) {
  const limitParam = Number(url.searchParams.get('limit'));
  const offsetParam = Number(url.searchParams.get('offset'));

  if (url.searchParams.get('limit') && Number.isNaN(limitParam)) {
    return jsonResponse(env, { error: 'Invalid limit' }, 400);
  }
  if (url.searchParams.get('offset') && Number.isNaN(offsetParam)) {
    return jsonResponse(env, { error: 'Invalid offset' }, 400);
  }

  const limit = Math.min(limitParam > 0 ? limitParam : 10, 15);
  const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);
  const requestedCount = Math.max(limit + offset, limit);
  const cappedRequested = Math.min(requestedCount, 50);

  const { articles, totalAvailable } = await collectArticles(cappedRequested);
  const pagedArticles = articles.slice(offset, offset + limit);
  const hasMore = totalAvailable > offset + pagedArticles.length;

  return jsonResponse(env, { articles: pagedArticles, totalAvailable, hasMore });
}

async function handleJobStart(request, env) {
  const payload = await safeJson(request, {});
  const { action, article, promptNotes = '', previousResult = {} } = payload;

  if (!['draft', 'redo', 'redo_image'].includes(action)) {
    return jsonResponse(env, { error: 'Unsupported action' }, 400);
  }
  if (!article || !article.link) {
    return jsonResponse(env, { error: 'Article payload missing required fields' }, 400);
  }

  const clientJobId = crypto.randomUUID();
  const workflowAction = action === 'redo_image' ? 'redo_image' : 'draft';
  const workflowInputs = {
    action: workflowAction,
    client_job_id: clientJobId,
    summary: workflowAction === 'redo_image' ? (previousResult.summary || '') : '',
    image: workflowAction === 'redo_image' ? (previousResult.image || '') : '',
    hashtags: workflowAction === 'redo_image' ? (Array.isArray(previousResult.hashtags) ? previousResult.hashtags.join(' ') : (previousResult.hashtags || '')) : '',
    link: article.link || '',
    date: article.date || '',
    source_name: article.source_name || deriveSourceName(article.link) || 'Source',
    prompt_notes: promptNotes,
    article_payload: JSON.stringify(article)
  };

  const ghRes = await dispatchWorkflow(env, workflowInputs);
  if (!ghRes.ok) {
    const text = await ghRes.text();
    console.error('Workflow dispatch failed', ghRes.status, text);
    return jsonResponse(env, { error: 'Failed to trigger workflow' }, 502);
  }

  return jsonResponse(env, { jobId: clientJobId });
}

async function handleJobSubRoutes(request, env, url) {
  const [, , , jobId, subroute] = url.pathname.split('/');
  if (!jobId) {
    return jsonResponse(env, { error: 'Job ID required' }, 400);
  }

  if (!subroute) {
    if (request.method !== 'GET') return jsonResponse(env, { error: 'Method not allowed' }, 405);
    return await getJobStatus(env, jobId);
  }

  if (subroute === 'actions') {
    if (request.method !== 'POST') return jsonResponse(env, { error: 'Method not allowed' }, 405);
    const payload = await safeJson(request, {});
    if (payload.action !== 'approve') {
      return jsonResponse(env, { error: 'Unsupported action' }, 400);
    }
    return await handleApprove(env, payload, jobId);
  }

  return jsonResponse(env, { error: 'Not found' }, 404);
}

async function getJobStatus(env, jobId) {
  const run = await findRunByClientJobId(env, jobId);
  if (!run) {
    return jsonResponse(env, { status: 'queued', logs: [`Looking for run ${jobId}`] });
  }

  const statusMap = {
    queued: 'queued',
    in_progress: 'running',
    completed: run.conclusion === 'success' ? 'success' : 'failed'
  };
  const status = statusMap[run.status] || run.status;
  let output = null;

  if (status === 'success') {
    output = await readConsoleArtifact(env, run.id, jobId);
  }

  return jsonResponse(env, {
    status,
    conclusion: run.conclusion,
    runId: run.id,
    output,
    logs: [`GitHub run ${run.status} (${run.conclusion || 'n/a'})`]
  });
}

async function handleApprove(env, payload, sourceJobId) {
  const { result = {}, article = {} } = payload;
  if (!result.summary || !result.image) {
    return jsonResponse(env, { error: 'Missing summary/image to approve' }, 400);
  }

  const clientJobId = crypto.randomUUID();
  const inputs = {
    action: 'approve',
    client_job_id: clientJobId,
    summary: result.summary,
    image: result.image,
    hashtags: Array.isArray(result.hashtags) ? result.hashtags.join(' ') : (result.hashtags || ''),
    link: article.link || result.link || '',
    date: article.date || result.date || '',
    source_name: article.source_name || result.source_name || deriveSourceName(article.link || result.link) || 'Source'
  };

  const ghRes = await dispatchWorkflow(env, inputs);
  if (!ghRes.ok) {
    const text = await ghRes.text();
    console.error('Approve workflow failed', ghRes.status, text);
    return jsonResponse(env, { error: 'Failed to trigger approval workflow' }, 502);
  }

  return jsonResponse(env, { ok: true, approvalJobId: clientJobId, sourceJobId });
}

async function handleLegacyApproval(url, env) {
  const action = url.searchParams.get('action');
  const summary = url.searchParams.get('summary') || '';
  const image = url.searchParams.get('image') || '';
  const hashtags = url.searchParams.get('hashtags') || '';
  const link = url.searchParams.get('link') || '';
  const date = url.searchParams.get('date') || '';
  const source = url.searchParams.get('source_name') || 'Source';
  const expires = url.searchParams.get('expires') || '';
  const signature = url.searchParams.get('sig') || '';

  const signingSecret = env.WORKER_SIGNING_SECRET || env.WORKER_SECRET_TOKEN;
  if (!signingSecret) {
    return new Response('Server misconfiguration', { status: 500 });
  }

  if (!['approve', 'redo', 'redo_image'].includes(action)) {
    return new Response('Invalid action', { status: 400 });
  }

  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return new Response('Unauthorized: Link expired', { status: 401 });
  }

  const signedPayload = [action, summary, image, hashtags, link, date, source, expires].join('\n');
  const expectedSignature = await signPayload(signingSecret, signedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return new Response('Unauthorized: Invalid signature', { status: 401 });
  }

  const inputs = { action, summary, image, hashtags, link, date, source_name: source };
  const ghRes = await dispatchWorkflow(env, inputs);
  if (!ghRes.ok) {
    const errText = await ghRes.text();
    return new Response(`Failed to trigger GitHub Action: ${ghRes.status} ${errText}`, { status: 500 });
  }

  return new Response(`Success! Action '${action}' has been sent to GitHub. You can close this window.`, {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

async function dispatchWorkflow(env, inputs) {
  const body = JSON.stringify({
    ref: 'main',
    inputs
  });

  return await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/daily-it-news.yml/dispatches`, {
    method: 'POST',
    body
  });
}

async function findRunByClientJobId(env, jobId) {
  const res = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/runs?per_page=50`);
  if (!res.ok) {
    console.error('Failed to list runs', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.workflow_runs.find((run) => {
    const title = run.display_title || '';
    const name = run.name || '';
    return title.includes(jobId) || name.includes(jobId);
  }) || null;
}

async function readConsoleArtifact(env, runId, jobId) {
  const artifactList = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/runs/${runId}/artifacts`);
  if (!artifactList.ok) {
    console.error('Artifact list failed', artifactList.status, await artifactList.text());
    return null;
  }
  const json = await artifactList.json();
  const target = json.artifacts.find((art) => art.name === `console-result-${jobId}`);
  if (!target) return null;

  const zipRes = await githubFetch(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/artifacts/${target.id}/zip`);
  if (!zipRes.ok) {
    console.error('Artifact download failed', zipRes.status, await zipRes.text());
    return null;
  }
  const buffer = new Uint8Array(await zipRes.arrayBuffer());
  const files = unzipSync(buffer);
  const firstFile = Object.keys(files)[0];
  if (!firstFile) return null;
  const text = new TextDecoder().decode(files[firstFile]);
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Artifact JSON parse error', err);
    return null;
  }
}

async function githubFetch(env, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
  headers.set('User-Agent', 'Daily-IT-Console');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  return await fetch(`https://api.github.com${path}`, { ...init, headers });
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Missing bearer token');
  }
  const token = header.slice(7);
  const payload = await verifyToken(token, env.CONSOLE_JWT_SECRET);
  if (!payload) {
    throw new ApiError(401, 'Invalid token');
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(env, data, status = 200, origin) {
  const body = JSON.stringify(data);
  const response = new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return applyCors(response, env, origin);
}

function buildCorsResponse(env, status = 200, origin) {
  const response = new Response(null, { status });
  return applyCors(response, env, origin);
}

function applyCors(response, env, requestOrigin) {
  const allowedOrigins = (env.CONSOLE_ALLOWED_ORIGIN || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  let originHeader = allowedOrigins[0] || '*';
  if (allowedOrigins.includes('*')) {
    originHeader = requestOrigin || '*';
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    originHeader = requestOrigin;
  }

  response.headers.set('Access-Control-Allow-Origin', originHeader);
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

async function safeJson(request, fallback) {
  try {
    return await request.json();
  } catch {
    return fallback;
  }
}

async function createToken(payload, secret) {
  const encoded = btoa(JSON.stringify(payload));
  const signature = await signPayload(secret, encoded);
  return `${encoded}.${signature}`;
}

async function verifyToken(token, secret) {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = await signPayload(secret, encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(atob(encoded));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function signPayload(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signature);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function collectArticles(targetCount) {
  const now = Date.now();
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  const results = [];
  const desiredCount = Math.max(targetCount || 0, 1);
  await Promise.all(
    FEEDS.map(async ([url, region]) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'DailyITConsole/1.0 (+https://github.com/CerberusITUK/dailypost)' } });
        if (!res.ok) return;
        const xml = await res.text();
        const entries = parseFeed(xml).map((entry) => ({ ...entry, region }));
        console.log('Feed parsed', url, entries.length);
        if (entries.length === 0) {
          const sample = xml.slice(0, 200).replace(/\s+/g, ' ').trim();
          console.log('Feed sample', url, sample);
        }
        for (const entry of entries) {
          const publishedTime = entry.published?.getTime();
          if (publishedTime && now - publishedTime > maxAgeMs) continue;
          const score = scoreEntry(entry, region);
          if (score === null) continue;
          results.push({ ...entry, score });
        }
        console.log('Feed accepted articles', url, entries.length);
      } catch (error) {
        console.error('Feed fetch failed', url, error);
      }
    })
  );

  const dedup = deduplicateByLink(results);
  dedup.sort((a, b) => b.score - a.score || (b.published?.getTime() || 0) - (a.published?.getTime() || 0));

  const windows = [24, 72, 168, null];
  for (const hours of windows) {
    const cutoff = hours === null ? -Infinity : now - hours * 60 * 60 * 1000;
    const subset = dedup.filter((entry) => {
      if (!entry.published) return true;
      return entry.published.getTime() >= cutoff;
    });
    console.log('Window', hours, 'articles', subset.length);
    if (subset.length >= desiredCount || hours === null) {
      const totalAvailable = subset.length;
      const selectionCount = Math.min(totalAvailable, desiredCount);
      const balanced = selectionCount > 0 ? selectBalancedArticles(subset, selectionCount) : [];
      return {
        articles: balanced.map((entry) => ({
          title: entry.title,
          summary: entry.summary,
          link: entry.link,
          date: formatDate(entry.published),
          source_name: entry.source_name || deriveSourceName(entry.link),
          region: entry.region
        })),
        totalAvailable
      };
    }
  }

  console.warn('No articles available after all windows');
  return { articles: [], totalAvailable: 0 };
}

function parseFeed(xml) {
  const entries = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const blocks = [...itemBlocks, ...entryBlocks];
  console.log('parseFeed blocks', itemBlocks.length, entryBlocks.length);
  for (const block of blocks) {
    const title = strip(decode(extractTag(block, 'title')));
    const link = extractLink(block);
    const summary = strip(decode(extractTag(block, 'summary') || extractTag(block, 'description') || extractTag(block, 'content')));
    const published = parseDate(extractTag(block, 'updated') || extractTag(block, 'published') || extractTag(block, 'pubDate'));
    if (!title || !link) {
      console.log('Entry missing', { title: Boolean(title), link: Boolean(link), snippet: block.slice(0, 120) });
      continue;
    }
    entries.push({ title, link, summary, published });
  }
  return entries;
}

function extractTag(block, tag) {
  const pattern = `<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`;
  const regex = new RegExp(pattern, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function extractLink(block) {
  const hrefMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
  if (hrefMatch) return hrefMatch[1];
  const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (linkMatch) return linkMatch[1].trim();
  const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  return guidMatch ? guidMatch[1].trim() : '';
}

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function strip(text) {
  if (!text) return '';
  const withoutCdata = text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
  return withoutCdata.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(text) {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function scoreEntry(entry, region) {
  const text = `${entry.title} ${entry.summary || ''}`.toLowerCase();
  if (POLITICAL_TERMS.some((term) => text.includes(term))) return null;
  let score = REGION_WEIGHTS[region] || 0;
  for (const keyword of COMMON_KEYWORDS) {
    if (text.includes(keyword)) score += 1;
  }
  for (const term of MAJOR_TECH_TERMS) {
    if (text.includes(term)) score += 2;
  }
  score += Math.random() * 0.75;
  return score;
}

function deduplicateByLink(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.link) return false;
    const key = item.link.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectBalancedArticles(entries, limit) {
  const maxItems = Math.min(limit, entries.length);
  const buckets = new Map();
  for (const entry of entries) {
    const sourceName = entry.source_name || deriveSourceName(entry.link);
    if (!buckets.has(sourceName)) {
      buckets.set(sourceName, []);
    }
    buckets.get(sourceName).push({ ...entry, source_name: sourceName });
  }

  const selected = [];
  while (selected.length < maxItems) {
    let addedThisRound = false;
    for (const bucket of buckets.values()) {
      if (!bucket.length) continue;
      selected.push(bucket.shift());
      addedThisRound = true;
      if (selected.length === maxItems) break;
    }
    if (!addedThisRound) break;
  }

  if (selected.length < maxItems) {
    const leftovers = [];
    for (const bucket of buckets.values()) {
      leftovers.push(...bucket);
    }
    leftovers.sort((a, b) => b.score - a.score || (b.published?.getTime() || 0) - (a.published?.getTime() || 0));
    for (const entry of leftovers) {
      selected.push(entry);
      if (selected.length === maxItems) break;
    }
  }

  return selected;
}

function deriveSourceName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    const core = parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov'].includes(parts.at(-2)) ? parts.at(-3) : parts.at(-2) || parts[0];
    return core.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  } catch {
    return 'Source';
  }
}

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// --- Minimal unzip implementation (fflate) ---
function unzipSync(data) {
  return fflateUnzip(data);
}

function fflateUnzip(dat) {
  const obj = {};
  let i = 0;
  while (i < dat.length) {
    if (dat[i] === 80 && dat[i + 1] === 75 && dat[i + 2] === 3 && dat[i + 3] === 4) {
      const nameLen = dat[i + 26] | (dat[i + 27] << 8);
      const extraLen = dat[i + 28] | (dat[i + 29] << 8);
      const compSize = dat[i + 18] | (dat[i + 19] << 8) | (dat[i + 20] << 16) | (dat[i + 21] << 24);
      const uncompSize = dat[i + 22] | (dat[i + 23] << 8) | (dat[i + 24] << 16) | (dat[i + 25] << 24);
      const offset = i + 30 + nameLen + extraLen;
      const nameBytes = dat.subarray(i + 30, i + 30 + nameLen);
      const name = new TextDecoder().decode(nameBytes);
      const compressed = dat.subarray(offset, offset + compSize);
      const method = dat[i + 8] | (dat[i + 9] << 8);
      let content;
      if (method === 0) {
        content = compressed;
      } else if (method === 8) {
        content = inflateSync(compressed, uncompSize);
      } else {
        throw new Error('Unsupported zip compression method');
      }
      obj[name] = content;
      i = offset + compSize;
    } else {
      i++;
    }
  }
  return obj;
}

function inflateSync(data, outSize) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(outSize).map(() => 0).buffer;
}
