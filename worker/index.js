/**
 * Cloudflare Worker — link ingestion endpoint
 *
 * Environment variables to set in the Cloudflare dashboard (or wrangler.toml secrets):
 *   GITHUB_TOKEN   — fine-grained token with Contents: read+write on the repo
 *   GITHUB_OWNER   — your GitHub username
 *   GITHUB_REPO    — repo name (e.g. "links")
 *   TOKEN_ARSENIJE — secret share token for arsenije  (e.g. a random UUID)
 *   TOKEN_MARKO    — secret share token for marko
 *
 * POST /
 * Body: { "url": "https://...", "token": "<your secret token>" }
 * Returns: { "ok": true } or { "error": "..." }
 */

const LINKS_FILE = 'links.md';

export default {
  async fetch(request, env) {
    // CORS — allow requests from the GitHub Pages domain and localhost
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, corsHeaders);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const { url, token } = body;

    if (!url || !token) {
      return json({ error: 'Missing url or token' }, 400, corsHeaders);
    }

    // Resolve author from token
    const author = resolveAuthor(token, env);
    if (!author) {
      return json({ error: 'Invalid token' }, 401, corsHeaders);
    }

    // Validate URL
    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      return json({ error: 'Invalid URL' }, 400, corsHeaders);
    }

    // Fetch OG metadata
    const meta = await fetchOG(url);

    // Build markdown entry
    const entry = buildEntry({ url, author, meta });

    // Append to links.md via GitHub API
    try {
      await prependToFile(entry, env);
    } catch (e) {
      return json({ error: 'GitHub write failed: ' + e.message }, 500, corsHeaders);
    }

    return json({ ok: true, title: meta.title || url }, 200, corsHeaders);
  },
};

// ─── Author resolution ────────────────────────────────────────────────────────

function resolveAuthor(token, env) {
  // Add more users by setting TOKEN_<NAME> env vars in Cloudflare dashboard
  const pairs = Object.entries(env)
    .filter(([k]) => k.startsWith('TOKEN_'))
    .map(([k, v]) => [k.slice(6).toLowerCase(), v]);

  for (const [name, secret] of pairs) {
    if (secret && token === secret) return name;
  }
  return null;
}

// ─── OG metadata fetch ────────────────────────────────────────────────────────

async function fetchOG(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'links-app/1.0 (OG metadata fetch)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    return {
      title:       og(html, 'og:title')       || titleTag(html),
      description: og(html, 'og:description') || '',
      image:       og(html, 'og:image')        || '',
    };
  } catch {
    return {};
  }
}

function og(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
  return m ? m[1].trim() : '';
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

// ─── Markdown entry builder ───────────────────────────────────────────────────

function buildEntry({ url, author, meta }) {
  const title = meta.title || url;
  const date  = new Date().toISOString();
  const lines = [
    `## ${sanitize(title)}`,
    `- url: ${url}`,
    `- author: ${author}`,
    `- date: ${date}`,
    `- image: ${meta.image || ''}`,
    `- description: ${sanitize(meta.description || '')}`,
    '',
  ];
  return lines.join('\n');
}

function sanitize(s) {
  return s.replace(/\n/g, ' ').replace(/\r/g, '').trim();
}

// ─── GitHub file write ────────────────────────────────────────────────────────

async function prependToFile(entry, env) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = env;
  const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${LINKS_FILE}`;
  const headers  = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'links-app/1.0',
    'Content-Type': 'application/json',
  };

  // Read current file (to get SHA + content)
  let sha = null;
  let existingContent = '';

  const getRes = await fetch(apiBase, { headers });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
    existingContent = atob(data.content.replace(/\n/g, ''));
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub GET ${getRes.status}`);
  }

  // Prepend new entry
  const newContent = entry + '\n' + existingContent;
  const encoded    = btoa(unescape(encodeURIComponent(newContent)));

  const body = {
    message: `add link by ${entry.match(/- author: (\S+)/)?.[1] || 'unknown'}`,
    content: encoded,
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub PUT ${putRes.status}: ${err}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
