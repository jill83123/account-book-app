import 'fake-indexeddb/auto'

// markLocalChange() touches localStorage and window; give the node environment minimal stand-ins
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  window: { dispatchEvent: () => true },
  CustomEvent: class {
    constructor(
      public type: string,
      public init?: unknown,
    ) {}
  },
})
