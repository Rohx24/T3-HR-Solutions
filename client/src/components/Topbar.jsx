import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth.jsx'
import { initials } from '../utils.js'
import { useTour } from './Tour.jsx'

const ROLE_LABEL = { admin: 'Admin', recruiter: 'Recruiter', interviewer: 'Interviewer' }

export default function Topbar() {
  const { user, logout } = useAuth()
  const tour = useTour()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
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
              <button className="menu-item danger" role="menuitem" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
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
