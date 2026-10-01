import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { initials } from '../utils.js'
import { useToast } from './Toast.jsx'
import { useTour } from './Tour.jsx'
import { Modal } from './ui.jsx'

const ROLE_LABEL = { admin: 'Admin', recruiter: 'Recruiter', interviewer: 'Interviewer' }

export default function Topbar() {
  const { user, logout } = useAuth()
  const tour = useTour()
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const menuRef = useRef(null)
  const config = useApi(() => api.authConfig(), [])
  const isDemo = config.data?.demo?.email?.toLowerCase() === user?.email?.toLowerCase()
  const toured = hasToured(user)

  useEffect(() => {
    if (!open) return
    const close = (e) => !menuRef.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function startTour() {
    markToured(user)
    tour.start()
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="mono muted">{today()}</span>
      </div>
      <div className="topbar-right">
        <button className={`btn btn-guide ${toured ? '' : 'pulse'}`} onClick={startTour} data-tour="guide">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
          </svg>
          Guide me
        </button>

        <div className="user-menu" ref={menuRef}>
          <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar">{initials(user?.name)}</span>
            )}
            <span className="user-name">{user?.name}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {open && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong>{user?.name}</strong>
                <span className="muted small">{user?.email}</span>
                <span className="role-pill">{ROLE_LABEL[user?.role] || user?.role}</span>
              </div>
              <div className="menu-row muted small">
                Workspace: <strong>{user?.workspace?.name}</strong>
              </div>
              <button className="menu-item" role="menuitem" onClick={() => (setOpen(false), startTour())}>
                Replay the guide
              </button>
              {!isDemo && user?.role === 'admin' && (
                <button className="menu-item" role="menuitem" onClick={() => (setOpen(false), setConfirmClear(true))}>
                  Clear all workspace data
                </button>
              )}
              <button className="menu-item danger" role="menuitem" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <ClearWorkspaceDialog open={confirmClear} onClose={() => setConfirmClear(false)} workspace={user?.workspace?.name} />
    </header>
  )
}

function ClearWorkspaceDialog({ open, onClose, workspace }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function clear(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { deleted } = await api.clearWorkspace()
      toast.success('Workspace cleared', { message: `${deleted.candidates} candidates, ${deleted.jobs} jobs and ${deleted.companies} companies removed.` })
      // Reload so every page starts from the empty workspace.
      setTimeout(() => window.location.assign('/'), 700)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Clear all workspace data" onClose={() => !busy && (setText(''), onClose())}>
      <form className="form" onSubmit={clear}>
        <p>
          This permanently deletes every candidate, resume, job, company and interview comment in <strong>{workspace}</strong>. Your
          account stays, and the dashboard goes back to zero. This cannot be undone.
        </p>
        <label className="field">
          <span>Type DELETE to confirm</span>
          <input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="DELETE" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={text !== 'DELETE' || busy}>
            {busy ? 'Clearing…' : 'Delete everything'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function today() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
}

const tourKey = (user) => `hr-int.toured.${user?.id}`
export function hasToured(user) {
  try {
    return localStorage.getItem(tourKey(user)) === '1'
  } catch {
    return true
  }
}
export function markToured(user) {
  try {
    localStorage.setItem(tourKey(user), '1')
  } catch {
    // storage unavailable: the pulse just shows again next time
  }
}
