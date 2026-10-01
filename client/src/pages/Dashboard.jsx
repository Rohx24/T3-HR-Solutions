import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { STAGES, stageSlug, timeAgo } from '../utils.js'
import { PageHeader, PageState } from '../components/ui.jsx'

const EVENT_ICONS = {
  created: '+',
  reapplied: '↻',
  stage_change: '→',
  stage: '→',
  note: '✎',
  application: '⇢',
}

function StatCard({ label, value, hint, to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? 0}</span>
      {hint && <span className="muted small">{hint}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="card stat-card link-card">
      {body}
    </Link>
  ) : (
    <div className="card stat-card">{body}</div>
  )
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi(() => api.stats(), [])
  if (!data) return <PageState loading={loading} error={error} onRetry={reload} />

  const { totals = {}, funnel = [], top_skills = [], roles = [], recent_events = [] } = data
  const counts = Object.fromEntries(funnel.map((f) => [f.stage, f.count]))
  const stages = [...STAGES, ...funnel.map((f) => f.stage).filter((s) => !STAGES.includes(s))]
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))
  const maxSkill = Math.max(1, ...top_skills.map((s) => s.count))
  const maxRole = Math.max(1, ...roles.map((r) => r.count))

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Talent pool and hiring pipeline at a glance" />

      <div className="stat-grid">
        <StatCard label="Candidates" value={totals.candidates} hint="in the talent pool" to="/candidates" />
        <StatCard label="Returning" value={totals.returning} hint="applied more than once" />
        <StatCard label="Open jobs" value={totals.open_jobs} hint="across client companies" to="/jobs" />
        <StatCard label="Active applications" value={totals.active_applications} hint={`${totals.hired ?? 0} hired so far`} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <h2 className="card-title">Pipeline funnel</h2>
          <div className="bars">
            {stages.map((stage) => (
              <div className="bar-row" key={stage}>
                <span className="bar-label">{stage}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill stage-fill-${stageSlug(stage)}`}
                    style={{ width: `${((counts[stage] || 0) / maxFunnel) * 100}%` }}
                  />
                </div>
                <span className="bar-value">{counts[stage] || 0}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Top skills in the pool</h2>
          {top_skills.length ? (
            <div className="bars">
              {top_skills.slice(0, 8).map((s) => (
                <div className="bar-row" key={s.skill}>
                  <Link className="bar-label link" to={`/candidates?skill=${encodeURIComponent(s.skill)}`}>
                    {s.skill}
                  </Link>
                  <div className="bar-track">
                    <div className="bar-fill accent-fill" style={{ width: `${(s.count / maxSkill) * 100}%` }} />
                  </div>
                  <span className="bar-value">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No candidates yet.</p>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Roles</h2>
          {roles.length ? (
            <div className="bars">
              {roles.map((r) => (
                <div className="bar-row" key={r.role}>
                  <Link className="bar-label link" to={`/candidates?role=${encodeURIComponent(r.role)}`}>
                    {r.role}
                  </Link>
                  <div className="bar-track">
                    <div className="bar-fill soft-fill" style={{ width: `${(r.count / maxRole) * 100}%` }} />
                  </div>
                  <span className="bar-value">{r.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No roles detected yet.</p>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Recent activity</h2>
          {recent_events.length ? (
            <ul className="feed">
              {recent_events.map((e) => (
                <li key={e.id} className={`feed-item feed-${e.type}`}>
                  <span className="feed-icon" aria-hidden="true">
                    {EVENT_ICONS[e.type] || '•'}
                  </span>
                  <div>
                    <p>
                      <Link className="link strong" to={`/candidates/${e.candidate_id}`}>
                        {e.candidate_name}
                      </Link>{' '}
                      <span className="muted">{e.message}</span>
                    </p>
                    <span className="muted small">{timeAgo(e.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing has happened yet.</p>
          )}
        </section>
      </div>
    </>
  )
}
