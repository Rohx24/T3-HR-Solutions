import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const ToastContext = createContext(null)
let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (type, title, opts = {}) => {
      const id = nextId++
      setToasts((list) => [...list, { id, type, title, ...opts }])
      setTimeout(() => dismiss(id), opts.duration ?? 4500)
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      success: (title, opts) => push('success', title, opts),
      error: (title, opts) => push('error', title, opts),
      info: (title, opts) => push('info', title, opts),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.message && <span>{t.message}</span>}
              {t.link && (
                <Link to={t.link.to} onClick={() => dismiss(t.id)}>
                  {t.link.label}
                </Link>
              )}
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
