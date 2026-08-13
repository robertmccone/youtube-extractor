# YT-Downloader Frontend

The React single-page app for the [YouTube Extractor](../README.md). Built with
React 19, Vite, Tailwind CSS 4, and shadcn/ui. See the root README for setup and
requirements.

## Running

This package is a workspace of the monorepo in the parent folder. Install dependencies
from the **root** folder, not here:

```bash
cd ..
npm install
```

Start the dev server, either from the root:

```bash
npm run dev                   # from the repo root
```

or directly:

```bash
npm run dev -w yt-dlp-frontend # from the repo root, targeting this workspace
```

That starts Vite on <http://localhost:5173> with hot reload. Run the backend alongside
it (`npm start` from the root) — calls to `/api/` and `/downloads/` are proxied to
`localhost:3333`. See [`vite.config.js`](vite.config.js) for the proxy setup.

## Building

```bash
npm run build   # from the repo root
```

The build output goes to **`../yt-dlp-backend/dist/`**, not a local `dist/` folder, so
the backend serves the freshly built app with no copy step.

## Configuration

Settings live in [`src/config.jsx`](src/config.jsx):

- `VERSION` and `TITLE` — shown in the header.
- `Protocol` — `http://` or `https://`. A TOR Onion service will most likely need
  `http://`.
- `BaseDomainAndPort` — host and port used to build the copy/download links. Use
  `localhost:5173` when developing against the Vite dev server; set it to your real
  host for production. The port can be omitted if you serve on 80 or 443.
- `PollWaitTime` — delay between download status polls, in ms.

Config changes need a rebuild to take effect in a production build.

## Test videos

- No chapters, 3:30 song — Six Feet Under, *Human Target*:
  `https://www.youtube.com/watch?v=atQLEu_yJNg`
- Full album with chapters, 41:28 — Vermilia, *Karsikko*:
  `https://www.youtube.com/watch?v=CJUAbeqRtr4`
