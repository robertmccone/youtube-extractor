import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Loader2, Copy, Download, Check } from 'lucide-react'
import { BaseURL, PollWaitTime } from '@/config'
import { Separator } from '@/components/ui/separator'

// ------------------------------------------------------------------------

// Matches www., m. (mobile), and music. subdomains, as well as no subdomain
const YT_HOST = /^(https?:\/\/)?((www|m|music)\.)?youtube\.com/

function isValidYouTubeUrl(url) {
  const patterns = [
    new RegExp(YT_HOST.source + /\/watch\?v=[\w-]+/.source),
    new RegExp(YT_HOST.source + /\/shorts\/[\w-]+/.source),
    new RegExp(YT_HOST.source + /\/embed\/[\w-]+/.source),
    /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
  ]
  return patterns.some(pattern => pattern.test(url))
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function YouTubeDownloader() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState('input') // input, loading, videoInfo, downloading, complete, error
  const [error, setError] = useState('')
  const [videoData, setVideoData] = useState(null)
  const [downloadType, setDownloadType] = useState('audio')
  const [chapterMode, setChapterMode] = useState('single')
  const [resolution, setResolution] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [title, setTitle] = useState('')
  const [chapterTitles, setChapterTitles] = useState({})
  const [requestId, setRequestId] = useState('')
  const [downloadResult, setDownloadResult] = useState(null)
  const [retryFn, setRetryFn] = useState(null)
  const [copied, setCopied] = useState({})

  const isValidUrl = isValidYouTubeUrl(url)

  const resetState = () => {
    setUrl('')
    setState('input')
    setError('')
    setVideoData(null)
    setDownloadType('audio')
    setChapterMode('single')
    setResolution('')
    setArtist('')
    setAlbum('')
    setTitle('')
    setChapterTitles({})
    setRequestId('')
    setDownloadResult(null)
    setRetryFn(null)
    setCopied({})
  }

  const fetchVideoData = async () => {
    setState('loading')
    setError('')
    try {
      const response = await fetch(`/api/videodata?url=${encodeURIComponent(url)}`, {
        method: 'GET',
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        setError(data.error || 'Failed to fetch video information')
        setState('error')
        return
      }

      setVideoData(data)
      if (data.resolutions && data.resolutions.length > 0) {
        setResolution(data.resolutions[0])
      }
      if (data.chapters && Array.isArray(data.chapters)) {
        const titles = {}
        data.chapters.forEach(ch => {
          titles[ch.number] = ch.title
        })
        setChapterTitles(titles)
      }
      setState('videoInfo')
    } catch (err) {
      setError('Network error. Please try again.')
      setState('error')
    }
  }

  const startMp3Download = async () => {
    setState('downloading')
    setError('')

    const payload = {
      url: videoData.url,
      title: videoData.title,
      artist: artist,
      album: album,
      user_title: title,
    }

    try {
      const response = await fetch('/api/getmp3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        setError(data.error || 'Failed to start download')
        setState('error')
        setRetryFn(() => startMp3Download)
        return
      }

      setRequestId(data.request)
      pollMp3Status(data.request)
    } catch (err) {
      setError('Network error. Please try again.')
      setState('error')
      setRetryFn(() => startMp3Download)
    }
  }

  const pollMp3Status = useCallback(async (reqId) => {
    try {
      const response = await fetch(`/api/getmp3/${reqId}`)
      const data = await response.json()

      if (data.status === 'error') {
        setError('Download failed. Please try again.')
        setState('error')
        setRetryFn(() => startMp3Download)
        return
      }

      if (data.status === 'finished') {
        setDownloadResult({ type: 'single', download_url: data.download_url })
        setState('complete')
        return
      }

      // status is pending, poll again
      setTimeout(() => pollMp3Status(reqId), PollWaitTime)
    } catch (err) {
      setError('Network error while checking status.')
      setState('error')
      setRetryFn(() => startMp3Download)
    }
  }, [])

  const startChapterDownload = async () => {
    setState('downloading')
    setError('')

    const chapters = videoData.chapters.map(ch => ({
      number: ch.number,
      title: ch.title,
      user_title: chapterTitles[ch.number] || ch.title,
    }))

    const payload = {
      url: videoData.url,
      title: videoData.title,
      artist: artist,
      album: album,
      chapters: chapters,
    }

    try {
      const response = await fetch('/api/getmp3chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        setError(data.error || 'Failed to start download')
        setState('error')
        setRetryFn(() => startChapterDownload)
        return
      }

      setRequestId(data.request)
      pollChapterStatus(data.request)
    } catch (err) {
      setError('Network error. Please try again.')
      setState('error')
      setRetryFn(() => startChapterDownload)
    }
  }

  const pollChapterStatus = useCallback(async (reqId) => {
    try {
      const response = await fetch(`/api/getmp3chapters/${reqId}`)
      const data = await response.json()

      if (data.status === 'error') {
        setError('Download failed. Please try again.')
        setState('error')
        setRetryFn(() => startChapterDownload)
        return
      }

      if (data.status === 'finished') {
        setDownloadResult({ type: 'chapters', download_urls: data.download_urls })
        setState('complete')
        return
      }

      // status is pending, poll again
      setTimeout(() => pollChapterStatus(reqId), PollWaitTime)
    } catch (err) {
      setError('Network error while checking status.')
      setState('error')
      setRetryFn(() => startChapterDownload)
    }
  }, [])

  const startVideoDownload = async () => {
    setState('downloading')
    setError('')

    const payload = {
      url: videoData.url,
      resolution: resolution,
    }

    try {
      const response = await fetch('/api/getvideo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok || data.error) {
        setError(data.error || 'Failed to start download')
        setState('error')
        setRetryFn(() => startVideoDownload)
        return
      }

      setRequestId(data.request)
      pollVideoStatus(data.request)
    } catch (err) {
      setError('Network error. Please try again.')
      setState('error')
      setRetryFn(() => startVideoDownload)
    }
  }

  const pollVideoStatus = useCallback(async (reqId) => {
    try {
      const response = await fetch(`/api/getvideo/${reqId}`)
      const data = await response.json()

      if (data.status === 'error') {
        setError('Download failed. Please try again.')
        setState('error')
        setRetryFn(() => startVideoDownload)
        return
      }

      if (data.status === 'finished') {
        setDownloadResult({ type: 'video', download_url: data.download_url })
        setState('complete')
        return
      }

      // status is pending, poll again
      setTimeout(() => pollVideoStatus(reqId), PollWaitTime)
    } catch (err) {
      setError('Network error while checking status.')
      setState('error')
      setRetryFn(() => startVideoDownload)
    }
  }, [])

  const copyToClipboard = async (text, id) => {
    await navigator.clipboard.writeText(text)
    setCopied(prev => ({ ...prev, [id]: true }))
    setTimeout(() => {
      setCopied(prev => ({ ...prev, [id]: false }))
    }, 2000)
  }

  const triggerDownload = (downloadUrl) => {
    window.open(downloadUrl, '_blank')
  }

  const handleDownloadClick = () => {
    if (downloadType === 'audio') {
      if (videoData.chapters && Array.isArray(videoData.chapters) && chapterMode === 'chapters') {
        startChapterDownload()
      } else {
        startMp3Download()
      }
    } else {
      startVideoDownload()
    }
  }

  // Input state
  if (state === 'input' || state === 'error') {
    return (
      <div className="flex flex-col items-center justify-start pt-16 px-4 w-full max-w-md mx-auto">
        {state === 'error' && (
          <div className="w-full mb-4 p-3 bg-destructive/20 border border-destructive rounded-md text-destructive-foreground text-sm">
            {error}
          </div>
        )}
        <p className="text-lg mb-4 text-center">Paste in a YouTube video link</p>
        <Input
          type="text"
          placeholder="e.g. https://youtube.com/watch?v=CJUAbeqRtr4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full mb-4"
        />
        <Button
          onClick={fetchVideoData}
          disabled={!isValidUrl}
          className="w-full h-12 text-lg bg-primary hover:bg-primary/90"
        >
          {state === 'error' ? 'RETRY' : 'START'}
        </Button>
      </div>
    )
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-start pt-16 px-4 w-full max-w-md mx-auto">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-center text-muted-foreground">
          Getting info for video: {url}
        </p>
      </div>
    )
  }

  // Downloading state
  if (state === 'downloading') {
    let message = `Attempting to download ${videoData.title}`
    if (downloadType === 'audio') {
      if (videoData.chapters && Array.isArray(videoData.chapters) && chapterMode === 'chapters') {
        message = `Attempting to download ${videoData.title}, split chapters, and convert to mp3s`
      } else {
        message = `Attempting to download ${videoData.title} and convert to mp3`
      }
    }

    return (
      <div className="flex flex-col items-center justify-start pt-16 px-4 w-full max-w-md mx-auto">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-center text-muted-foreground">{message}</p>
      </div>
    )
  }

  // Complete state
  if (state === 'complete') {
    if (downloadResult.type === 'chapters') {
      const sortedUrls = [...downloadResult.download_urls].sort((a, b) => a.number - b.number)
      return (
        <div className="flex flex-col items-center justify-start pt-8 px-4 w-full max-w-md mx-auto">
          <p className="text-lg font-semibold mb-6 text-center">
            Your download and conversion to mp3s has finished
          </p>
          <div className="w-full space-y-4 mb-6">
            {sortedUrls.map((item) => (
              <div key={item.number} className="border border-border rounded-md p-3">
                <p className="font-medium mb-2">{item.number}. {item.title}</p>
                <p className="text-sm text-muted-foreground break-all mb-2">{BaseURL}{item.url}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(BaseURL + item.url, item.number)}
                  >
                    {copied[item.number] ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => triggerDownload(BaseURL + item.url)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            onClick={resetState}
            className="w-full h-12 text-lg bg-primary hover:bg-primary/90"
          >
            Download another video
          </Button>
        </div>
      )
    }

    // Single file (audio or video)
    const completionMessage = downloadResult.type === 'video'
      ? 'Your video is now available for download'
      : 'Your download and conversion to mp3 has finished'

    return (
      <div className="flex flex-col items-center justify-start pt-16 px-4 w-full max-w-md mx-auto">
        <p className="text-lg font-semibold mb-6 text-center">{completionMessage}</p>
        <div className="w-full border border-border rounded-md p-4 mb-6">
          <p className="text-sm text-muted-foreground break-all mb-3">
            {BaseURL}{downloadResult.download_url}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => copyToClipboard(BaseURL + downloadResult.download_url, 'main')}
            >
              {copied['main'] ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              Copy URL
            </Button>
            <Button
              variant="outline"
              onClick={() => triggerDownload(BaseURL + downloadResult.download_url)}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
        <Button
          onClick={resetState}
          className="w-full h-12 text-lg bg-primary hover:bg-primary/90"
        >
          Download another video
        </Button>
      </div>
    )
  }

  // Video info state
  if (state === 'videoInfo') {
    const hasChapters = videoData.chapters && Array.isArray(videoData.chapters) && videoData.chapters.length > 0
    const sortedChapters = hasChapters
      ? [...videoData.chapters].sort((a, b) => a.number - b.number)
      : []

    return (
      <div className="flex flex-col items-center justify-start pt-8 px-4 w-full max-w-md mx-auto pb-8">
        <img
          src={videoData.thumbnail}
          alt={videoData.title}
          className="w-full max-w-sm rounded-lg mb-4"
        />
        <h2 className="text-lg font-bold text-center mb-1">{videoData.title}</h2>
        <p className="text-sm text-muted-foreground mb-2">{videoData.channel}</p>
        <p className="text-sm text-muted-foreground mb-6">
          Length: {formatDuration(videoData.length)}
        </p>

        <ToggleGroup
          type="single"
          value={downloadType}
          onValueChange={(val) => val && setDownloadType(val)}
          className="mb-6"
        >
          <ToggleGroupItem value="audio" className="px-4">
            Download as audio (mp3)
          </ToggleGroupItem>
          <ToggleGroupItem value="video" className="px-4">
            Download as video
          </ToggleGroupItem>
        </ToggleGroup>

        {downloadType === 'audio' && (
          <>
            <Separator />
            {hasChapters && (
              <ToggleGroup
                type="single"
                value={chapterMode}
                onValueChange={(val) => val && setChapterMode(val)}
                className="mb-6 mt-6"
              >
                <ToggleGroupItem value="single" className="px-4">
                  Download as single file
                </ToggleGroupItem>
                <ToggleGroupItem value="chapters" className="px-4">
                  Split chapters as songs
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            <div className="w-full space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Artist</label>
                <Input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Enter artist name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Album</label>
                <Input
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="Enter album name"
                />
              </div>

              {(!hasChapters || chapterMode === 'single') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter title"
                  />
                </div>
              )}

              {hasChapters && chapterMode === 'chapters' && (
                <div className="space-y-3">
                  {sortedChapters.map((chapter) => (
                    <div key={chapter.number} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-6 text-right">
                        {chapter.number}
                      </span>
                      <Input
                        value={chapterTitles[chapter.number] || ''}
                        onChange={(e) => setChapterTitles(prev => ({
                          ...prev,
                          [chapter.number]: e.target.value
                        }))}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {downloadType === 'video' && (
          <div className="w-full mb-6">
            <label className="block text-sm font-medium mb-2">Resolution/Quality</label>
            <ToggleGroup
              type="single"
              value={resolution}
              onValueChange={(val) => val && setResolution(val)}
              className="flex-wrap"
            >
              {videoData.resolutions.map((res) => (
                <ToggleGroupItem key={res} value={res} className="px-4">
                  {res}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        <Button
          onClick={handleDownloadClick}
          className="w-full h-12 text-lg bg-primary hover:bg-primary/90"
        >
          Download
        </Button>
      </div>
    )
  }

  return null
}
