import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { Item } from '../types'

interface AddItemDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (item: Omit<Item, 'id'>) => void
}

export default function AddItemDialog({ isOpen, onClose, onAdd }: AddItemDialogProps) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [type, setType] = useState<'file' | 'folder' | 'shortcut'>('file')

  const handleBrowse = useCallback(async () => {
    if (!window.electronAPI) return
    const paths = await window.electronAPI.showOpenDialog({
      title: '选择应用或文件夹',
      properties: ['openFile', 'openDirectory'],
    })
    if (paths && paths.length > 0) {
      const selected = paths[0]
      setPath(selected)
      // Extract name from path
      const parts = selected.replace(/\\/g, '/').split('/')
      const rawName = parts[parts.length - 1] || selected
      setName(rawName.replace(/\.lnk$/i, ''))

      // Guess type
      if (selected.toLowerCase().endsWith('.lnk')) {
        setType('shortcut')
      } else if (!selected.includes('.')) {
        setType('folder')
      } else {
        setType('file')
      }
    }
  }, [])

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !path.trim()) return
    onAdd({ name: name.trim(), path: path.trim(), type })
    setName('')
    setPath('')
    onClose()
  }, [name, path, type, onAdd, onClose])

  if (!isOpen) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-96 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-6 no-drag"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white/90 text-sm font-medium mb-4">手动添加项目</h3>

        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="text-white/50 text-xs block mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="显示名称"
              className="w-full bg-white/10 text-white px-3 py-2 rounded-lg outline-none text-sm border border-white/20 focus:border-white/40 placeholder-white/30"
            />
          </div>

          {/* Path */}
          <div>
            <label className="text-white/50 text-xs block mb-1">路径</label>
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="文件或文件夹路径"
                className="flex-1 bg-white/10 text-white px-3 py-2 rounded-lg outline-none text-sm border border-white/20 focus:border-white/40 placeholder-white/30"
              />
              <button
                onClick={handleBrowse}
                className="bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 rounded-lg text-sm transition-colors"
              >
                浏览
              </button>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-white/50 text-xs block mb-1">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full bg-white/10 text-white px-3 py-2 rounded-lg outline-none text-sm border border-white/20"
            >
              <option value="file">文件 / 应用</option>
              <option value="folder">文件夹</option>
              <option value="shortcut">快捷方式</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white/60 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !path.trim()}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            添加
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
