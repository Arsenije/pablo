# links

Shared link list for two people. Send a link from any device; it appears on a single page.

All data lives in `links.md` — a plain text file you own. The app is a single `index.html`.

---

## How it works

```
Your phone (iOS Shortcut / Android)
    │  POST { url, token }
    ▼
Cloudflare Worker
    │  fetch OG metadata → commit to links.md
    ▼
GitHub repo → GitHub Pages → index.html
```

---

## Setup

### 1. Create the GitHub repo

1. Create a new public repo (e.g. `links`)
2. Push this folder to it
3. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. Your site will be at `https://<you>.github.io/links`

### 2. Create a GitHub fine-grained token

1. Go to **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**
2. Repository access: only `links`
3. Permissions: **Contents → Read and write**
4. Copy the token

### 3. Deploy the Cloudflare Worker

```bash
cd worker
npm install -g wrangler        # if you don't have it
wrangler login
```

Edit `wrangler.toml` — set your `GITHUB_OWNER` and `GITHUB_REPO`.

Set secrets (never commit these):
```bash
wrangler secret put GITHUB_TOKEN     # paste the token from step 2
wrangler secret put TOKEN_ARSENIJE   # make up a secret string, e.g. a UUID
wrangler secret put TOKEN_MIKA       # make up a different secret string
```

Deploy:
```bash
wrangler deploy
```

Copy the worker URL (e.g. `https://links-worker.<you>.workers.dev`).

### 4. iOS Shortcut

Create a shortcut with these steps:

1. **Receive** → Any input → Share Sheet
2. **URL** → Get URLs from `Shortcut Input`
3. **Get contents of URL**
   - URL: `https://links-worker.<you>.workers.dev`
   - Method: POST
   - Request Body: JSON
     ```
     { "url": [URL from step 2], "token": "your-secret-token" }
     ```
4. **Show notification** → `Saved`

Name it "Save Link" and it appears in every share sheet.

**Mika** does the same setup but uses his own token (`TOKEN_MIKA`).

### 5. Android

Use the [HTTP Shortcuts](https://http-shortcuts.rmy.ch) app:
- Method: POST
- URL: `https://links-worker.<you>.workers.dev`
- Body (JSON): `{ "url": "{url}", "token": "your-secret-token" }`
- Add as share target

---

## Adding more users

Add a new environment variable to the Cloudflare Worker:
```bash
wrangler secret put TOKEN_NEWPERSON
```

That person uses their token in their shortcut. Their name appears on the cards.

---

## Data format

`links.md` is plain text. Every entry looks like this:

```markdown
## Article Title
- url: https://example.com/article
- author: arsenije
- date: 2026-03-17T14:30:00Z
- image: https://example.com/og.jpg
- description: Short summary from the OG tag.
```

Newest entries are at the top. You can edit the file manually — changes appear on the site after the next page load.

---

## Custom domain

When you buy a domain:
1. Add a `CNAME` file to the repo with your domain (e.g. `links.yourdomain.com`)
2. In your DNS, add a CNAME record pointing to `<you>.github.io`
3. In GitHub Pages settings, set the custom domain

For email-based submission (send a link by email instead of shortcut), add the domain to Cloudflare and set up Email Workers — see the Cloudflare Email Workers docs.
