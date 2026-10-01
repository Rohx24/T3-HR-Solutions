import { useCallback, useEffect, useRef, useState } from 'react'

// Fetch on mount / when deps change. Keeps the previous data while reloading
// so pages don't flash, and ignores responses from superseded requests.
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const seq = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    return fetcher().then(
      (data) => {
        if (id === seq.current) setState({ data, error: null, loading: false })
      },
      (error) => {
        if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false }))
      },
    )
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}

export function useDebounced(value, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
