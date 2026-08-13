# YouTube Extractor

A self-hosted Node.js app for downloading YouTube videos, optionally extracting the
audio as MP3s, splitting chapter-marked videos into individual album tracks, and
tagging everything with your own metadata.

It is a thin, friendly web frontend over two command line programs you already have
installed on the machine: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) for downloading
and [`eyeD3`](https://eyed3.readthedocs.io/) for writing ID3 tags.

Note: This project is mostly generated using Claude Code with little direct human programming.

## What it does

Paste a YouTube link and the app fetches the video's title, channel, thumbnail,
duration, chapter list, and available resolutions. From there you can:

- **Download as video** — MP4, capped at 1080p, at low (≤480p), mid (≤720p), or hi
  (≤1080p) quality. Only the resolutions the source video actually supports are offered.
- **Download as audio** — a single MP3, with artist, album, and title you supply.
- **Split chapters as songs** — for chapter-marked videos (full album uploads, live
  sets, mixes), each chapter becomes its own MP3, tagged with a track number, an
  editable per-track title, and a shared artist/album. Files come out named
  `01 - Track Title.mp3` so they drop straight into a music library.

Downloads run asynchronously: the browser gets a request ID back immediately and polls
for status until the files are ready, then offers copy-link and download buttons.

## Repository layout

This is an npm workspaces monorepo with two packages:

| Path | What it is |
| --- | --- |
| [`yt-dlp-backend/`](yt-dlp-backend/) | Express API server. Shells out to `yt-dlp` and `eyeD3`, serves finished files from `/downloads`, and serves the built frontend. |
| [`yt-dlp-frontend/`](yt-dlp-frontend/) | React 19 + Vite + Tailwind 4 + shadcn/ui single-page app. |

The frontend builds directly into `yt-dlp-backend/dist/`, which the backend serves as
static files — so in production a single Node process serves both the API and the UI.

## Requirements

- **Node.js 20+** and npm 8+ (npm workspaces support).
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** on your `PATH`. The backend invokes
  it with `--js-runtimes node`, so a reasonably recent version is expected.
- **[`eyeD3`](https://eyed3.readthedocs.io/)** on your `PATH`, for writing MP3 tags.
- **`ffmpeg`**, which `yt-dlp` needs for audio extraction, chapter splitting, and
  merging separate video/audio streams.

Check that the external tools are visible:

```bash
yt-dlp --version
eyeD3 --version
ffmpeg -version
```

## Getting started

All commands below are run from **this root folder** — npm workspaces installs and
builds both packages from here.

```bash
# Install dependencies for both packages into a single root node_modules
npm install

# Build the frontend into yt-dlp-backend/dist/
npm run build

# Start the server — serves the API and the built UI on http://localhost:3333
npm start
```

Then open <http://localhost:3333>.

The app does look for env variable `PORT` so if you wish to run on a different port without 
altering the code, e.g. port 4000, you may run with something like `PORT=4000 npm start`

### Root scripts

| Command | What it does |
| --- | --- |
| `npm install` | Installs dependencies for both workspaces into the root `node_modules`. |
| `npm run build` | Builds the frontend into `yt-dlp-backend/dist/`. |
| `npm start` | Starts the backend on port 3333 (serves API + built UI). |
| `npm run dev` | Starts the Vite dev server on port 5173 with hot reload. |
| `npm run lint` | Runs ESLint over the frontend. |
| `npm run update` | Runs `npm update` across both workspaces and the root. |
| `npm run outdated` | Lists outdated dependencies across both workspaces and the root. |

To run a command against just one package, use `-w`:

```bash
npm install express -w yt-dlp-backend
npm run build -w yt-dlp-frontend
```

## Development

For frontend work you want both processes running, in two terminals:

```bash
npm start      # backend API on :3333
npm run dev    # Vite dev server on :5173, with hot reload
```

Then use <http://localhost:5173>. Vite proxies `/api` and `/downloads` through to the
backend on port 3333, so the dev server behaves like the production setup — see
[`yt-dlp-frontend/vite.config.js`](yt-dlp-frontend/vite.config.js).

Note that in dev mode you should set `BaseDomainAndPort` in
[`yt-dlp-frontend/src/config.jsx`](yt-dlp-frontend/src/config.jsx) to `localhost:5173`
so the copy-link and download buttons point at the dev server. For production, set it
to the host and port (or Onion address) you actually serve from.

## Configuration

**Frontend** — [`yt-dlp-frontend/src/config.jsx`](yt-dlp-frontend/src/config.jsx):

| Setting | Purpose |
| --- | --- |
| `VERSION` | Shown in the header. Drop the `-dev` suffix for a release. |
| `TITLE` | App name in the header. |
| `Protocol` | `http://` or `https://`. A TOR Onion service will most likely need `http://`. |
| `BaseDomainAndPort` | Host and port used to build the copy/download links. Omit the port if serving on 80 or 443. |
| `PollWaitTime` | How long, in ms, to wait between download status polls. Defaults to 10 seconds. |

Config changes require a rebuild (`npm run build`) to take effect in production.

**Backend** — [`yt-dlp-backend/index.js`](yt-dlp-backend/index.js):

| Setting | Purpose |
| --- | --- |
| `PORT` env var | Server port. Defaults to `3333`. |
| `MAX_RESOLUTION` | Quality cap for video downloads. Defaults to `1080`. |
| `RESOLUTION_MAP` | Maps the `low`/`mid`/`hi` labels to `yt-dlp` format selectors. |

```bash
PORT=8080 npm start
```

## API

The backend exposes a small JSON API under `/api`. Downloads are two-step: `POST` to
start a job and get a request ID, then `GET` with that ID to poll until it finishes.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/videodata?url=<url>` | Fetch title, duration, thumbnail, channel, chapters, and available resolutions. |
| `POST /api/getmp3` | Start a single-MP3 download. Body: `url`, `title`, `user_title`, `artist`, `album`. |
| `GET /api/getmp3/:request_id` | Poll status. Returns `download_url` when `finished`. |
| `POST /api/getmp3chapters` | Start a chapter-split download. Body: `url`, `title`, `artist`, `album`, `chapters[]`. |
| `GET /api/getmp3chapters/:request_id` | Poll status. Returns `download_urls[]` when `finished`. |
| `POST /api/getvideo` | Start a video download. Body: `url`, `resolution` (`low`/`mid`/`hi`). |
| `GET /api/getvideo/:request_id` | Poll status. Returns `download_url` when `finished`. |

Poll responses carry a `status` of `pending`, `finished`, or `error`. Errors are
returned as `{ "error": "..." }` with a 200 status rather than an HTTP error code.

Accepted link formats — `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, and `/embed/`,
on the `www.`, `m.` (mobile), and `music.` subdomains, plus bare 11-character video IDs
on the backend.

## Where files go

Finished downloads are written under `yt-dlp-backend/downloads/` and served at
`/downloads`:

| Directory | Contents |
| --- | --- |
| `downloads/mp3/` | Single-file MP3s, named by request ID. |
| `downloads/video/` | Downloaded MP4s, named by request ID. |
| `downloads/chapters/<request-id>/` | One folder per chapter-split job, holding the numbered tracks. |

These directories are created on startup if missing. Their contents are git-ignored,
and nothing is ever cleaned up automatically — prune the folder yourself as it grows.

## Test videos

Handy links for exercising both paths:

- **No chapters**, 3:30 song — Six Feet Under, *Human Target*:
  `https://www.youtube.com/watch?v=atQLEu_yJNg`
- **Full album with chapters**, 41:28 — Vermilia, *Karsikko*:
  `https://www.youtube.com/watch?v=CJUAbeqRtr4`

## Notes and limitations

- **Job state is in memory.** Restarting the backend loses all in-flight and completed
  request IDs; the files on disk survive, but their status URLs stop resolving.
- **There is no authentication.** Anyone who can reach the port can queue downloads and
  read every file in `downloads/`. Keep it on a trusted network, behind a reverse proxy,
  or on an Onion service — don't expose it to the open internet as-is.
- **Metadata is sanitized for shell safety**, so characters outside
  `a-z A-Z 0-9 _ - . , ( )` and spaces are stripped from titles, artists, and albums.
- Downloads run as unbounded concurrent child processes; there is no queue or rate limit.

## License

MIT
