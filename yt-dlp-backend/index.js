const express = require('express');
const path = require('path');
const { execSync, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3333;

// Maximum video quality cap
const MAX_RESOLUTION = 1080;

// Resolution map: label -> yt-dlp format selector
const RESOLUTION_MAP = {
  low:  `bestvideo[height<=480]+bestaudio/best[height<=480]`,
  mid:  `bestvideo[height<=720]+bestaudio/best[height<=720]`,
  hi:   `bestvideo[height<=${MAX_RESOLUTION}]+bestaudio/best[height<=${MAX_RESOLUTION}]`,
};

// In-memory request store
const requests = {};

// Directories
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const MP3_DIR = path.join(DOWNLOADS_DIR, 'mp3');
const VIDEO_DIR = path.join(DOWNLOADS_DIR, 'video');
const CHAPTERS_DIR = path.join(DOWNLOADS_DIR, 'chapters');

[MP3_DIR, VIDEO_DIR, CHAPTERS_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// Additional yt-dlp args to get around being blocked
// TODO this is a temporary hack for sure, need to refactor
// the building of the yt-dlp cmd into a function and 
// allow for intelligent retries and adjustments when 
// blocked, including waits and such
const ADDITIONAL_ARGS = `--extractor-args "youtube:player_client=web_embedded,web,tv"`;

// Middleware
app.use(express.json());

// Serve downloaded files
app.use('/downloads', express.static(DOWNLOADS_DIR));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a YouTube video ID from a URL or bare string.
 * Returns the 11-character ID or null if it doesn't look like one.
 */
function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  input = input.trim();

  // Bare video ID (11 alphanumeric + dash/underscore chars)
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');

    if (!['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      return null;
    }

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=<id>
    const vParam = url.searchParams.get('v');
    if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) return vParam;

    // youtube.com/embed/<id> or /v/<id> or /shorts/<id>
    const pathMatch = url.pathname.match(/^\/(embed|v|shorts)\/([A-Za-z0-9_-]{11})/);
    if (pathMatch) return pathMatch[2];

    return null;
  } catch {
    return null;
  }
}

/**
 * Sanitize a string for safe shell usage — strip anything that isn't
 * alphanumeric, space, dash, underscore, or period.
 */
function shellSafe(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9 _\-.,()]/g, '');
}

/**
 * Pick resolution labels available for a video given its actual height.
 */
function availableResolutions(height) {
  const res = [];
  if (height >= 1) res.push('low');
  if (height >= 480) res.push('mid');
  if (height >= 720) res.push('hi');
  // If the video is tiny, at least offer "low"
  if (res.length === 0) res.push('low');
  return res;
}

// ---------------------------------------------------------------------------
// GET /api/videodata?url=<videourl>
// ---------------------------------------------------------------------------
app.get('/api/videodata', (req, res) => {
  const urlParam = req.query.url;
  const videoId = extractYouTubeId(urlParam);

  if (!videoId) {
    return res.json({
      error: 'Supplied link does not appear to be an accessible video on YouTube',
    });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const result = execSync(`yt-dlp --dump-json --skip-download --js-runtimes node "${ytUrl}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(result);

    // Chapters
    let chapters = false;
    if (data.chapters && data.chapters.length > 0) {
      chapters = data.chapters.map((ch, i) => ({
        number: i + 1,
        title: ch.title,
      }));
    }

    // Best video height for resolution options
    const bestHeight = data.height || (data.formats || []).reduce((max, f) => {
      return (f.height && f.height > max) ? f.height : max;
    }, 0);

    const resolutions = availableResolutions(bestHeight);

    return res.json({
      title: data.title || '',
      length: data.duration || 0,
      url: ytUrl,
      thumbnail: data.thumbnail || '',
      channel: data.channel || data.uploader || '',
      chapters,
      resolutions,
    });
  } catch (err) {
    return res.json({
      error: err.stderr ? err.stderr.toString().trim() : 'Failed to fetch video data',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/getmp3
// ---------------------------------------------------------------------------
app.post('/api/getmp3', (req, res) => {
  const { url, title, album, artist, user_title } = req.body;
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return res.json({
      error: 'Supplied link does not appear to be an accessible video on YouTube',
    });
  }

  const requestId = uuidv4();
  requests[requestId] = { status: 'pending', url: '' };

  res.json({ request: requestId, status: 'pending', url: '' });

  // Async download
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let safeTitle = shellSafe(title) || videoId;
  if (user_title !== "") {
    safeTitle = shellSafe(user_title);
  }
  const outputPath = path.join(MP3_DIR, `${requestId}.mp3`);

  const downloadCmd = `yt-dlp -x --audio-format mp3 -o "${outputPath}" ${ADDITIONAL_ARGS} --js-runtimes node "${ytUrl}"`;

  exec(downloadCmd, { maxBuffer: 10 * 1024 * 1024 }, (dlErr) => {
    if (dlErr) {
      requests[requestId].status = 'error';
      requests[requestId].error = dlErr.stderr ? dlErr.stderr.toString().trim() : 'Download failed';
      return;
    }

    // Set metadata with eyeD3
    // these should get set no matter what is returned, can adjust this code more
    const tagParts = [];
    if (safeTitle)  tagParts.push(`-t "${safeTitle}"`);
    if (album)  tagParts.push(`-A "${shellSafe(album)}"`);
    if (artist) tagParts.push(`-a "${shellSafe(artist)}"`);

    if (tagParts.length > 0) {
      const tagCmd = `eyeD3 ${tagParts.join(' ')} "${outputPath}"`;
      exec(tagCmd, (tagErr) => {
        if (tagErr) {
          console.error('eyeD3 error:', tagErr.message);
        }
        requests[requestId].status = 'finished';
        requests[requestId].url = `/downloads/mp3/${requestId}.mp3`;
      });
    } else {
      requests[requestId].status = 'finished';
      requests[requestId].url = `/downloads/mp3/${requestId}.mp3`;
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/getmp3/:request_id
// ---------------------------------------------------------------------------
app.get('/api/getmp3/:request_id', (req, res) => {
  const entry = requests[req.params.request_id];

  if (!entry) {
    return res.json({ error: 'Request not found' });
  }

  const response = { status: entry.status };
  if (entry.status === 'finished') response.download_url = entry.url;
  if (entry.status === 'error') response.error = entry.error;
  return res.json(response);
});

// ---------------------------------------------------------------------------
// POST /api/getmp3chapters
// ---------------------------------------------------------------------------
app.post('/api/getmp3chapters', (req, res) => {
  const { url, title, artist, album, chapters } = req.body;
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return res.json({
      error: 'Supplied link does not appear to be an accessible video on YouTube',
    });
  }

  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    return res.json({ error: 'No chapters supplied' });
  }

  const requestId = uuidv4();
  requests[requestId] = { status: 'pending', download_urls: [] };

  res.json({ request: requestId, status: 'pending', download_urls: [] });

  // Async download + split chapters
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const chapterDir = path.join(CHAPTERS_DIR, requestId);
  fs.mkdirSync(chapterDir, { recursive: true });

  const outputTemplate = path.join(chapterDir, '%(section_number)03d.%(ext)s');
  const downloadCmd = `yt-dlp -x --audio-format mp3 --split-chapters -o "chapter:${outputTemplate}" ${ADDITIONAL_ARGS} --js-runtimes node --exec "post_process:rm" "${ytUrl}"`;

  exec(downloadCmd, { maxBuffer: 10 * 1024 * 1024 }, (dlErr) => {
    if (dlErr) {
      requests[requestId].status = 'error';
      requests[requestId].error = dlErr.stderr ? dlErr.stderr.toString().trim() : 'Download failed';
      return;
    }

    // List the generated mp3 files sorted by name
    let files;
    try {
      files = fs.readdirSync(chapterDir)
        .filter(f => f.endsWith('.mp3'))
        .sort();
    } catch {
      requests[requestId].status = 'error';
      requests[requestId].error = 'Failed to read chapter files';
      return;
    }

    // Tag each chapter file
    const downloadUrls = [];
    let pending = files.length;

    if (pending === 0) {
      requests[requestId].status = 'error';
      requests[requestId].error = 'No chapter files were produced';
      return;
    }

    files.forEach((file, idx) => {
      const filePath = path.join(chapterDir, file);
      const chapter = chapters[idx] || {};
      const chTitle = shellSafe(chapter.user_title || chapter.title || `Chapter ${idx + 1}`);
      const trackNum = chapter.number || (idx + 1);

      const tagParts = [];
      tagParts.push(`-t "${chTitle}"`);
      tagParts.push(`-n ${trackNum}`);
      if (artist) tagParts.push(`-a "${shellSafe(artist)}"`);
      if (album)  tagParts.push(`-A "${shellSafe(album)}"`);

      const tagCmd = `eyeD3 ${tagParts.join(' ')} "${filePath}"`;

      exec(tagCmd, () => {
        // Rename to something friendlier
        const friendlyName = `${String(trackNum).padStart(2, '0')} - ${chTitle}.mp3`
          .replace(/[^a-zA-Z0-9 _\-.()]/g, '');
        const friendlyPath = path.join(chapterDir, friendlyName);

        try {
          fs.renameSync(filePath, friendlyPath);
        } catch {
          // keep original name if rename fails
        }

        const serveName = fs.existsSync(friendlyPath) ? friendlyName : file;

        downloadUrls.push({
          number: trackNum,
          title: chapter.user_title || chapter.title || `Chapter ${idx + 1}`,
          url: `/downloads/chapters/${requestId}/${encodeURIComponent(serveName)}`,
        });

        pending--;
        if (pending === 0) {
          downloadUrls.sort((a, b) => a.number - b.number);
          requests[requestId].status = 'finished';
          requests[requestId].download_urls = downloadUrls;
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/getmp3chapters/:request_id
// ---------------------------------------------------------------------------
app.get('/api/getmp3chapters/:request_id', (req, res) => {
  const entry = requests[req.params.request_id];

  if (!entry) {
    return res.json({ error: 'Request not found' });
  }

  const response = { status: entry.status };
  if (entry.status === 'finished') response.download_urls = entry.download_urls;
  if (entry.status === 'error') response.error = entry.error;
  return res.json(response);
});

// ---------------------------------------------------------------------------
// POST /api/getvideo
// ---------------------------------------------------------------------------
app.post('/api/getvideo', (req, res) => {
  const { url, resolution } = req.body;
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return res.json({
      error: 'Supplied link does not appear to be an accessible video on YouTube',
    });
  }

  const formatSelector = RESOLUTION_MAP[resolution] || RESOLUTION_MAP.hi;
  const requestId = uuidv4();
  requests[requestId] = { status: 'pending', url: '' };

  res.json({ request: requestId, status: 'pending', url: '' });

  // Async download
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(VIDEO_DIR, `${requestId}.%(ext)s`);
  const downloadCmd = `yt-dlp -f "${formatSelector}" --merge-output-format mp4 -o "${outputPath}" ${ADDITIONAL_ARGS} --js-runtimes node "${ytUrl}"`;

  exec(downloadCmd, { maxBuffer: 10 * 1024 * 1024 }, (dlErr) => {
    if (dlErr) {
      requests[requestId].status = 'error';
      requests[requestId].error = dlErr.stderr ? dlErr.stderr.toString().trim() : 'Download failed';
      return;
    }

    // Find the actual output file (yt-dlp fills in the extension)
    const files = fs.readdirSync(VIDEO_DIR).filter(f => f.startsWith(requestId));
    const outputFile = files[0] || `${requestId}.mp4`;

    requests[requestId].status = 'finished';
    requests[requestId].url = `/downloads/video/${encodeURIComponent(outputFile)}`;
  });
});

// ---------------------------------------------------------------------------
// GET /api/getvideo/:request_id
// ---------------------------------------------------------------------------
app.get('/api/getvideo/:request_id', (req, res) => {
  const entry = requests[req.params.request_id];

  if (!entry) {
    return res.json({ error: 'Request not found' });
  }

  const response = { status: entry.status };
  if (entry.status === 'finished') response.download_url = entry.url;
  if (entry.status === 'error') response.error = entry.error;
  return res.json(response);
});

// ---------------------------------------------------------------------------
// Static SPA serving — must come AFTER /api routes and /downloads static
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
