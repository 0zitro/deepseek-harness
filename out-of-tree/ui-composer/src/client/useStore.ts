/**
 * The uSES bridge this package needs for the two stores its chrome reads
 * directly (the trigger controller's menu store). The renderer's own
 * `bindSnapshotSelector` is the same construction but is not exported on its
 * module-table face; this is the bridge inlined, per its contract: bare
 * sources on the engine side, binding on the React side, stable closures so
 * components never resubscribe across renders.
 */
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'

/**
 * Bind a bare observable source to a typed selector hook.
 * @param source - snapshot source (subscribe + getSnapshot).
 * @returns the selector hook, stable per source.
 */
export function useStoreOf<T>(source: { subscribe(run: () => void): () => void; getSnapshot(): T }) {
  const subscribe = (fn: () => void) => source.subscribe(fn)
  const getSnapshot = () => source.getSnapshot()
  return function useSelector<S>(sel: (s: T) => S): S {
    return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, sel)
  }
}
