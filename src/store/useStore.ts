import { create } from 'zustand'
import type { Collection, Item } from '../types'

const generateId = () => Math.random().toString(36).slice(2, 11)

interface StoreState {
  collections: Collection[]
  loaded: boolean

  // Data loading
  load: () => Promise<void>
  save: () => Promise<void>

  // Collection CRUD
  addCollection: (name: string) => void
  removeCollection: (id: string) => void
  updateCollection: (id: string, updates: Partial<Pick<Collection, 'name' | 'x' | 'y'>>) => void
  moveCollection: (id: string, x: number, y: number) => void

  // Item CRUD
  addItem: (collectionId: string, item: Omit<Item, 'id'>) => void
  removeItem: (collectionId: string, itemId: string) => void
  reorderItems: (collectionId: string, startIndex: number, endIndex: number) => void
}

const useStore = create<StoreState>((set, get) => ({
  collections: [],
  loaded: false,

  load: async () => {
    try {
      // Priority 1: Load from disk (has the most up-to-date data with icons)
      if (window.electronAPI) {
        const data = await window.electronAPI.loadData()
        if (data && data.collections && data.collections.length > 0) {
          set({ collections: data.collections, loaded: true })
          return
        }
      }

      // Priority 2: Fallback — data passed via URL param (handles race condition)
      const params = new URLSearchParams(window.location.search)
      const initStr = params.get('init')
      if (initStr) {
        try {
          const collection = JSON.parse(decodeURIComponent(initStr))
          if (collection && collection.id) {
            set({ collections: [collection], loaded: true })
            return
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Failed to load data:', e)
    }
    set({ loaded: true })
  },

  save: async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveData({ collections: get().collections })
      }
    } catch (e) {
      console.error('Failed to save data:', e)
    }
  },

  // --- Collections ---

  addCollection: (name: string) => {
    const collection: Collection = {
      id: generateId(),
      name,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      items: [],
    }
    set((s) => ({ collections: [...s.collections, collection] }))
    get().save()
  },

  removeCollection: (id: string) => {
    set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }))
    get().save()
  },

  updateCollection: (id, updates) => {
    set((s) => ({
      collections: s.collections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }))
    get().save()
  },

  moveCollection: (id, x, y) => {
    set((s) => ({
      collections: s.collections.map((c) => (c.id === id ? { ...c, x, y } : c)),
    }))
    get().save()
  },

  // --- Items ---

  addItem: (collectionId, itemData) => {
    const item: Item = {
      id: generateId(),
      ...itemData,
    }
    set((s) => ({
      collections: s.collections.map((c) =>
        c.id === collectionId ? { ...c, items: [...c.items, item] } : c
      ),
    }))
    get().save()
  },

  removeItem: (collectionId, itemId) => {
    set((s) => ({
      collections: s.collections.map((c) =>
        c.id === collectionId
          ? { ...c, items: c.items.filter((i) => i.id !== itemId) }
          : c
      ),
    }))
    get().save()
  },

  reorderItems: (collectionId, startIndex, endIndex) => {
    set((s) => ({
      collections: s.collections.map((c) => {
        if (c.id !== collectionId) return c
        const items = [...c.items]
        const [removed] = items.splice(startIndex, 1)
        items.splice(endIndex, 0, removed)
        return { ...c, items }
      }),
    }))
    get().save()
  },
}))

export default useStore
