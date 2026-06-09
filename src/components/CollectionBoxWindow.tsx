import { useState, useCallback, useEffect } from 'react'
import { Reorder } from 'framer-motion'
import type { Collection, Item } from '../types'
import useStore from '../store/useStore'

interface Props {
  collectionId: string
}

export default function CollectionBoxWindow({ collectionId }: Props) {
  const collections = useStore((s) => s.collections)
  const addItem = useStore((s) => s.addItem)
  const removeItem = useStore((s) => s.removeItem)
  const reorderItems = useStore((s) => s.reorderItems)
  const removeCollection = useStore((s) => s.removeCollection)
  const updateCollection = useStore((s) => s.updateCollection)
  const load = useStore((s) => s.load)
  const loaded = useStore((s) => s.loaded)

  const collection = collections.find((c) => c.id === collectionId)
  const [expanded, setExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (collection) {
      setItems(collection.items)
      setEditName(collection.name)
    }
  }, [collection?.items, collection?.name])

  const handleToggleExpand = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    if (window.electronAPI) {
      window.electronAPI.toggleExpand(collectionId, next)
    }
  }, [expanded, collectionId])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as any).path as string
      if (!filePath) continue

      let itemName = file.name
      let itemPath = filePath
      let iconSource = filePath // best path to extract icon from
      let itemType: 'file' | 'folder' | 'shortcut' = 'file'

      if (file.name.toLowerCase().endsWith('.lnk') || file.name.toLowerCase().endsWith('.url')) {
        itemType = 'shortcut'
        itemName = file.name.replace(/\.(lnk|url)$/i, '')
        if (window.electronAPI) {
          const resolved = await window.electronAPI.resolveShortcut(filePath)
          if (resolved) {
            if (resolved.target) itemPath = resolved.target
            // Shortcut's embedded icon path (e.g. Steam game .ico)
            if (resolved.icon) iconSource = resolved.icon
          }
        }
      } else if (!file.name.includes('.')) {
        itemType = 'folder'
      }

            let icon: string | undefined
      if (window.electronAPI) {
        icon = (await window.electronAPI.getFileIcon(iconSource)) ?? undefined
        // Fallback: try original .lnk if embedded icon didn't work
        if (!icon && iconSource !== filePath) {
          icon = (await window.electronAPI.getFileIcon(filePath)) ?? undefined
        }
      }
            addItem(collectionId, { name: itemName, path: itemPath, type: itemType, icon })
    }
  }, [collectionId, addItem])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'link'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleOpenItem = useCallback(async (item: Item) => {
    if (window.electronAPI) {
      await window.electronAPI.openPath(item.path)
    }
  }, [])

  const handleReorder = useCallback((newItems: Item[]) => {
    setItems(newItems)
    if (!collection) return
    const oldOrder = collection.items
    for (let i = 0; i < newItems.length; i++) {
      if (newItems[i].id !== oldOrder[i]?.id) {
        const movedItem = newItems[i]
        const oldIndex = oldOrder.findIndex((item) => item.id === movedItem.id)
        if (oldIndex >= 0) {
          reorderItems(collectionId, oldIndex, i)
        }
        break
      }
    }
  }, [collectionId, collection, reorderItems])

  const handleRename = useCallback(() => {
    if (editName.trim()) {
      updateCollection(collectionId, { name: editName.trim() })
    }
    setIsEditing(false)
  }, [editName, collectionId, updateCollection])

  const handleAddFromBrowse = useCallback(async () => {
    if (!window.electronAPI) return
    const paths = await window.electronAPI.showOpenDialog({})
    if (!paths || paths.length === 0) return
    for (const p of paths) {
      const parts = p.replace(/\\/g, '/').split('/')
      const name = parts[parts.length - 1] || p
      const isFolder = !name.includes('.')
      const isShortcut = name.toLowerCase().endsWith('.lnk') || name.toLowerCase().endsWith('.url')
      let itemPath = p
      let iconSource = p
      let itemType: 'file' | 'folder' | 'shortcut' = 'file'

      if (isShortcut) {
        itemType = 'shortcut'
        const resolved = await window.electronAPI.resolveShortcut(p)
        if (resolved) {
          if (resolved.target) itemPath = resolved.target
          if (resolved.icon) iconSource = resolved.icon
        }
      } else if (isFolder) {
        itemType = 'folder'
      }

      let icon: string | undefined
      try { icon = (await window.electronAPI.getFileIcon(iconSource)) ?? undefined } catch { /* */ }
      if (!icon && iconSource !== p) {
        try { icon = (await window.electronAPI.getFileIcon(p)) ?? undefined } catch { /* */ }
      }
      addItem(collectionId, {
        name: isShortcut ? name.replace(/\.(lnk|url)$/i, '') : name,
        path: itemPath,
        type: itemType,
        icon,
      })
    }
  }, [collectionId, addItem])

  const handleRecreate = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const boxId = params.get('box')
    if (boxId) {
      // Create a new collection with the same ID and refresh
      useStore.getState().addCollection as any
      // Actually: create new, set the ID, refresh
      const newCol: Collection = {
        id: boxId,
        name: '新收纳框',
        x: 500,
        y: 300,
        items: [],
      }
      useStore.setState((s) => ({ collections: [newCol], loaded: true }))
      // Save to disk
      window.electronAPI?.saveData({ collections: [newCol] })
    }
  }, [])

  if (!loaded || !collection) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-white/60 text-xs">{!loaded ? '加载中...' : '未找到收纳框'}</span>
        {loaded && !collection && (
          <button
            onClick={handleRecreate}
            className="bg-white/20 hover:bg-white/30 text-white/80 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            + 新建收纳框
          </button>
        )}
      </div>
    )
  }

  const maxIcons = 6
  const previewItems = collection.items.slice(0, maxIcons)
  const overflow = collection.items.length - maxIcons

  // Fixed icon sizes — simpler and more reliable than dynamic calculation
  const iconSize = 32
  const imgSize = 22

  return (
    <div
      className="w-full h-full bg-transparent select-none overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Collapsed view */}
      <div className={`w-full h-full bg-white/20 backdrop-blur-xl rounded-2xl border border-white/30 shadow-xl flex flex-col ${expanded ? 'hidden' : ''}`}>
        {/* Title bar — native window drag via CSS */}
        <div className="flex items-center justify-between px-2.5 py-1.5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          {isEditing ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') { setIsEditing(false); setEditName(collection.name) }
              }}
              onBlur={handleRename}
              className="bg-white/10 text-white text-[10px] font-medium px-1.5 py-0.5 rounded outline-none border border-white/20 w-20"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
          ) : (
            <span
              className="text-white/80 text-[10px] font-medium truncate"
              onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
            >
              {collection.name}
            </span>
          )}
          <div className="flex gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditName(collection.name) }}
              className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/30 text-white/50 hover:text-white text-[8px] transition-colors"
            >✎</button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                // Hide to tray instead of closing — preserves data
                window.electronAPI?.hideBoxWindow(collectionId)
              }}
              className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-400/60 text-white/50 hover:text-white text-[8px] transition-colors"
              title="隐藏到托盘"
            >✕</button>
          </div>
        </div>

        {/* Icon preview — no-drag so drop events work here */}
        <div
          className="flex-1 flex items-center justify-center px-2 pb-2 cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={handleToggleExpand}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {collection.items.length === 0 ? (
            <span className="text-white/30 text-[10px]">点击添加项目</span>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="grid grid-cols-3 grid-rows-2 gap-1.5 place-items-center">
                {previewItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md flex items-center justify-center overflow-hidden bg-white/5 border border-white/10"
                    style={{ width: iconSize, height: iconSize }}
                  >
                    {item.icon ? (
                      <div
                        style={{
                          width: imgSize,
                          height: imgSize,
                          backgroundImage: `url(${item.icon})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                        }}
                      />
                    ) : (
                      <span className="text-[10px]">
                        {item.type === 'folder' ? '📁' : '📄'}
                      </span>
                    )}
                  </div>
                ))}
                {Array.from({ length: maxIcons - previewItems.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="rounded-md border border-dashed border-white/10"
                    style={{ width: iconSize, height: iconSize }}
                  />
                ))}
              </div>
              {overflow > 0 && (
                <span className="absolute bottom-0 right-2 text-white/30 text-[10px]">
                  +{overflow}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-center text-white/20 text-[8px] pb-1.5">
          {collection.items.length} 项 · 点击展开
        </div>
      </div>

      {/* Expanded view */}
      <div className={`w-full h-full bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl flex flex-col ${expanded ? '' : 'hidden'}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <h3 className="text-white/90 text-xs font-medium">{collection.name}</h3>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button onClick={handleAddFromBrowse} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[10px] transition-colors">+</button>
            <button onClick={handleToggleExpand} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[10px] transition-colors">✕</button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver ? (
            <div className="text-blue-300/60 text-[10px] text-center py-8 border-2 border-dashed border-blue-400/30 rounded-xl m-1">释放以添加</div>
          ) : items.length === 0 ? (
            <div className="text-white/30 text-[10px] text-center py-8">拖入文件/文件夹来添加</div>
          ) : (
            <Reorder.Group axis="y" values={items} onReorder={handleReorder}>
              {items.map((item) => (
                <Reorder.Item key={item.id} value={item}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group" onDoubleClick={() => handleOpenItem(item)}>
                    <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.icon ? (
                        <div
                          className="w-4 h-4"
                          style={{
                            backgroundImage: `url(${item.icon})`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                          }}
                        />
                      ) : (
                        <span className="text-[10px]">{item.type === 'folder' ? '📁' : '📄'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[10px] truncate">{item.name}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeItem(collectionId, item.id) }} className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-400/60 text-white/30 hover:text-white text-[8px] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">✕</button>
                    <span className="text-white/15 text-[10px] cursor-grab flex-shrink-0">⠿</span>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>
        <div className="text-center text-white/15 text-[8px] py-1.5 border-t border-white/10">双击打开 · 拖拽排序 · 拖入文件添加</div>
      </div>
    </div>
  )
}
