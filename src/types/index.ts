export interface Item {
  id: string
  name: string
  path: string // 原文件绝对路径，永不修改
  type: 'file' | 'folder' | 'shortcut'
  icon?: string // base64 图标缓存
}

export interface Collection {
  id: string
  name: string
  x: number // 画布坐标 X
  y: number // 画布坐标 Y
  items: Item[]
}
