import type { Item } from '../types'

interface IconPreviewProps {
  items: Item[]
  maxIcons?: number
}

export default function IconPreview({ items, maxIcons = 6 }: IconPreviewProps) {
  const visible = items.slice(0, maxIcons)
  const overflow = items.length - maxIcons

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-white/30 text-xs">拖入应用或文件夹</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-1.5 w-full h-full place-items-center">
      {visible.map((item) => (
        <div
          key={item.id}
          className="w-7 h-7 rounded-md flex items-center justify-center overflow-hidden bg-white/5 border border-white/10"
        >
          {item.icon ? (
            <img src={item.icon} alt={item.name} className="w-5 h-5 object-contain" />
          ) : (
            <span className="text-white/40 text-[8px] text-center leading-tight">
              {item.type === 'folder' ? '📁' : '📄'}
            </span>
          )}
        </div>
      ))}
      {/* Fill empty slots with placeholder */}
      {Array.from({ length: maxIcons - visible.length }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="w-7 h-7 rounded-md border border-dashed border-white/10"
        />
      ))}
      {/* Overflow indicator */}
      {overflow > 0 && (
        <div className="absolute bottom-1 right-2 text-white/40 text-[8px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  )
}
