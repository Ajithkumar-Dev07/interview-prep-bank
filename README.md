# Production Support Interview Bank

A searchable, filterable Q&A reference for production-support interview prep. **Front end only, read-only** — there is no in-app editor or backend. All content lives in this repo as JSON files under `data/`, and the page fetches it at load time. This repo *is* the database: adding, editing, or removing a question means editing a file and pushing a commit.

## How content is structured

```
data/
├── index.json              ← manifest: lists every topic file
└── topics/
    ├── self-introduction.json
    ├── sql.json
    ├── unix.json
    └── ... (18 topic files)
```

**`data/index.json`** lists every topic the app should load:

```json
{
  "version": 1,
  "topics": [
    { "id": "sql", "label": "SQL", "file": "topics/sql.json" },
    { "id": "unix", "label": "Unix", "file": "topics/unix.json" }
  ]
}
```

**Each topic file** (e.g. `data/topics/sql.json`) is a flat array of questions:

```json
[
  {
    "id": "q1",
    "heading": "Difference between DELETE and TRUNCATE?",
    "parentHeading": null,
    "content": "DELETE removes rows one at a time and can be rolled back...\nTRUNCATE deallocates pages and cannot be rolled back in most engines."
  }
]
```

Field notes:
- `id` only needs to be unique *within that file* — the app namespaces it internally as `<topicId>:<id>`.
- `heading` is the question text. It's what search and the autocomplete box match against first.
- `content` is the answer. Plain text — use `\n` for line breaks, `-   ` for bullet-style lines (matches how the original source document was written).
- `parentHeading` is optional. Use it to cluster several questions under one scenario (e.g. `"Scenario 3 — Batch Job Delay"`), the way the "Scenario-Based Answers" topic does. Set it to `null` when not needed.

## Adding a new topic

1. Create a new file at `data/topics/<your-slug>.json` containing a JSON array (start with `[]` if empty, or with your first question). `data/topics/_example-template.json` is a ready-made starting point to copy — it is **not** registered in `index.json`, so the app ignores it.
2. Add an entry for it to `data/index.json`:
   ```json
   { "id": "your-slug", "label": "Your Topic Label", "file": "topics/your-slug.json" }
   ```
3. Commit and push to `main`.
4. If GitHub Pages is set up as described below, it redeploys automatically within a minute or two, and the new topic appears in the sidebar — no code changes needed.

## Adding a question to an existing topic

Open the relevant file under `data/topics/`, append an object to the array (give it a locally-unique `id`), commit, push. Same auto-deploy behavior.

## Editing or removing a question

Edit or delete the object in place in its topic file, commit, push. Git's own history is your version history now — `git log -- data/topics/sql.json` shows every past change to that file, which replaces the in-app changelog the earlier prototype had.

## Running locally

Because the app uses `fetch()` to load the JSON files, opening `index.html` directly from disk (a `file://` URL) will fail in most browsers — `fetch` is blocked on `file://` for security reasons. Serve the folder over HTTP instead:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then visit the printed `localhost` URL. The app shows a loading spinner, then the question list; if `data/index.json` or a topic file fails to load, it shows what went wrong instead of a blank page.

## Deploying to GitHub Pages

No build step is required — this is static HTML/CSS/JS.

1. Push this repo to GitHub (`git init`, `git remote add origin <url>`, `git add .`, `git commit -m "Initial commit"`, `git push -u origin main`).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`.
4. Save. The site publishes at `https://<your-username>.github.io/<repo-name>/` within a minute or two.
5. From then on, every push to `main` — including just adding a topic JSON file — triggers a redeploy automatically.

(For a fuller walkthrough of custom domains, HTTPS, and GitHub Actions-based deploys, see the separate GitHub deployment guide if you have it from earlier.)

## What's intentionally *not* here

- **No admin UI / in-app editing** — removed by request. All changes happen as commits.
- **No version history panel** — Git's own history replaces it.
- **No server or database** — the app is static files only; GitHub + GitHub Pages is the entire stack.
- Favorites (the ★ toggle) are the one piece of client-side state left, stored in the visitor's own browser via `localStorage`. They're personal to that browser/device and aren't part of the content pipeline.
