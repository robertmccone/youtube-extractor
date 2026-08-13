# YT-Downloader Backend

The Express API server for the [YouTube Extractor](../README.md). See the root
README for setup, requirements, and the full API reference.

## Running

This package is a workspace of the monorepo in the parent folder. Install dependencies
from the **root** folder, not here:

```bash
cd ..
npm install
```

Then start the server, either from the root:

```bash
npm start                       # from the repo root
```

or directly:

```bash
npm run start -w yt-dlp-backend # from the repo root, targeting this workspace
node index.js                   # from this folder
```

Default port is 3333; override it with the `PORT` environment variable.

## What it serves

- **`/api/...`** — GET and POST endpoints for fetching video metadata and running
  download jobs. Documented in the [root README](../README.md#api).
- **`/downloads/...`** — static files from the `downloads/` folder, where finished
  MP3s and videos are written.
- **Everything else** — static files from `dist/`, which is where the React frontend
  builds to. Unmatched routes fall back to `dist/index.html` for SPA routing.

`dist/` is populated by running `npm run build` from the repo root — the frontend's
Vite config points its build output here, so no copy step is needed.

## External dependencies

The server shells out to `yt-dlp` (which itself needs `ffmpeg`) and `eyeD3`. Both must
be installed and on the `PATH`.
