import { onScopeDispose, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import type { Observable } from 'dexie'

/**
 * Subscribe to a Dexie liveQuery. The factory is re-run whenever reactive values it
 * reads (or the extra `deps`) change.
 */
export function useLiveQuery<T>(
  factory: () => Observable<T>,
  initial: T,
  deps?: WatchSource[],
): Ref<T> {
  const value = shallowRef(initial) as Ref<T>
  let sub: { unsubscribe(): void } | undefined
  const stop = watch(
    deps ?? [() => factory],
    () => {
      sub?.unsubscribe()
      sub = factory().subscribe({ next: (v) => (value.value = v), error: (e) => console.error(e) })
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    stop()
    sub?.unsubscribe()
  })
  return value
}
