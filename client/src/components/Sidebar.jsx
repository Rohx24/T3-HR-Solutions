import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import Logo from './Logo.jsx'

const icons = {
  dashboard: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" />,
  candidates: (
    <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6M17 3.5a4 4 0 0 1 0 7.5M19 14.5c1.9.9 3 2.9 3 5.5" />
  ),
  jobs: <path d="M3 8h18v12H3V8Zm5 0V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18" />,
}

const links = [
  { to: '/', label: 'Home', hint: 'Summary of your hiring', icon: 'dashboard', end: true },
  { to: '/candidates', label: 'Candidates', hint: 'People and their resumes', icon: 'candidates' },
  { to: '/jobs', label: 'Jobs', hint: 'Openings and interviews', icon: 'jobs' },
]

export default function Sidebar() {
  const { user } = useAuth()
  return (
    <aside className="sidebar">
      <NavLink to="/" className="side-logo" aria-label="Dashboard">
        <Logo />
      </NavLink>

      <div className="ws-chip" title={user?.workspace?.name}>
        <span className="mono">Workspace</span>
        <strong>{user?.workspace?.name}</strong>
      </div>

      <nav className="nav" data-tour="nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icons[l.icon]}
            </svg>
            <span className="nav-label">
              <span>{l.label}</span>
              <small>{l.hint}</small>
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot mono">Applicant tracking · v0.2</div>
    </aside>
  )
}
