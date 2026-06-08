import { useState, useCallback, useEffect } from 'react'
import { motion, Reorder } from 'framer-motion'
import type { Collection, Item } from '../types'
import useStore from '../store/useStore'

interface ExpandedPanelProps {
  collection: Collection
  onClose: () => void
  onAddItem?: () => void
}

export default function ExpandedPanel({ collection, onClose, onAddItem }: ExpandedPanelProps) {
  const removeItem = useStore((s) => s.removeItem)
  const addItem = useStore((s) => s.addItem)
  const reorderItems = useStore((s) => s.reorderItems)
  const [items, setItems] = useState(collection.items)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleReorder = useCallback(
    (newItems: Item[]) => {
      setItems(newItems)
      const oldOrder = collection.items
      for (let i = 0; i < newItems.length; i++) {
        if (newItems[i].id !== oldOrder[i]?.id) {
          const movedItem = newItems[i]
          const oldIndex = oldOrder.findIndex((item) => item.id === movedItem.id)
          if (oldIndex >= 0) {
            reorderItems(collection.id, oldIndex, i)
          }
          break
        }
      }
    },
    [collection.id, collection.items, reorderItems]
  )

  const handleOpenItem = useCallback(async (item: Item) => {
    if (window.electronAPI) {
      await window.electronAPI.openPath(item.path)
    }
  }, [])

  // Drag-and-drop from Explorer: accept files, save only references
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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
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
        let itemType: 'file' | 'folder' | 'shortcut' = 'file'

        // Determine type
        if (file.name.toLowerCase().endsWith('.lnk')) {
          itemType = 'shortcut'
          itemName = file.name.replace(/\.lnk$/i, '')
          if (window.electronAPI) {
            const resolved = await window.electronAPI.resolveShortcut(filePath)
            if (resolved?.target) itemPath = resolved.target
          }
        } else if (!file.name.includes('.')) {
          itemType = 'folder'
        }

        // Get icon
        let icon: string | undefined
        if (window.electronAPI) {
          icon = (await window.electronAPI.getFileIcon(filePath)) ?? undefined
        }

        addItem(collection.id, { name: itemName, path: itemPath, type: itemType, icon })
      }
    },
    [collection.id, addItem]
  )

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={`w-80 max-h-[70vh] bg-white/10 backdrop-blur-2xl rounded-2xl border shadow-2xl overflow-hidden no-drag transition-colors ${
          isDragOver ? 'border-blue-400/60 bg-blue-400/5' : 'border-white/20'
        }`}
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-white/90 text-sm font-medium">{collection.name}</h3>
          <div className="flex items-center gap-1">
            {onAddItem && (
              <button
                onClick={onAddItem}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition-colors"
                title="手动添加"
              >
                +
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Item list */}
        <div className="overflow-y-auto max-h-[55vh] p-2">
          {isDragOver && items.length === 0 ? (
            <div className="text-center text-blue-300/60 text-xs py-12 border-2 border-dashed border-blue-400/30 rounded-xl m-2">
              释放以添加项目
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-white/30 text-xs py-8">
              拖入应用或文件夹来添加项目
            </div>
          ) : (
            <Reorder.Group axis="y" values={items} onReorder={handleReorder}>
              {items.map((item) => (
                <Reorder.Item key={item.id} value={item}>
                  <div
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer group"
                    onDoubleClick={() => handleOpenItem(item)}
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.icon ? (
                        <img src={item.icon} alt={item.name} className="w-6 h-6 object-contain" />
                      ) : (
                        <span className="text-sm">{item.type === 'folder' ? '📁' : '📄'}</span>
                      )}
                    </div>

                    {/* Name + path */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white/90 text-xs truncate">{item.name}</p>
                      <p className="text-white/30 text-[10px] truncate">{item.path}</p>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeItem(collection.id, item.id)
                      }}
                      className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-400/60 text-white/40 hover:text-white text-[10px] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="移除"
                    >
                      ✕
                    </button>

                    {/* Drag handle */}
                    <div className="text-white/20 text-xs cursor-grab active:cursor-grabbing flex-shrink-0">
                      ⠿
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/10 text-center text-white/20 text-[10px]">
          双击打开 · 拖拽排序 · 从桌面拖入添加
        </div>
      </motion.div>
    </motion.div>
  )
}
