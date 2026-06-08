import { useEffect } from 'react'
import useStore from './store/useStore'
import CollectionBoxWindow from './components/CollectionBoxWindow'

function App() {
  const load = useStore((s) => s.load)
  const loaded = useStore((s) => s.loaded)

  useEffect(() => {
    load()
  }, [load])

  // Check if we're in a box window mode (?box=<collectionId>)
  const params = new URLSearchParams(window.location.search)
  const boxId = params.get('box')

  if (!loaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <span className="text-white/30 text-xs">...</span>
      </div>
    )
  }

  // If loaded in a box window, render just that collection
  if (boxId) {
    return <CollectionBoxWindow collectionId={boxId} />
  }

  // Main window (shouldn't normally be visible)
  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent">
      <span className="text-white/20 text-xs">Tidy</span>
    </div>
  )
}

export default App
