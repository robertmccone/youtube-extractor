import { Header } from './components/Header'
import { YouTubeDownloader } from './components/YouTubeDownloader'

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <YouTubeDownloader />
      </main>
    </div>
  )
}

export default App
