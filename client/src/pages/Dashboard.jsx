import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { STAGES, stageSlug, timeAgo } from '../utils.js'
import { PageState } from '../components/ui.jsx'
import { CountUp, LineReveal, RiseWords } from '../components/TextFx.jsx'
import { firstName, useAuth } from '../auth.jsx'
import HelpBox from '../components/HelpBox.jsx'

const EVENT_ICONS = {
  created: '+',
  reapplied: '↻',
  stage_change: '→',
  stage: '→',
  note: '✎',
  application: '⇢',
  applied: '⇢',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function StatCard({ label, value, hint, to, i = 0 }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        <CountUp value={value ?? 0} />
      </span>
      {hint && <span className="muted small">{hint}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="card stat-card link-card rise" style={{ '--i': i }}>
      {body}
    </Link>
  ) : (
    <div className="card stat-card rise" style={{ '--i': i }}>
      {body}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi(() => api.stats(), [])
  if (!data) return <PageState loading={loading} error={error} onRetry={reload} />

  const { totals = {}, funnel = [], top_skills = [], roles = [], recent_events = [] } = data
  if (!totals.candidates && !totals.open_jobs) return <Welcome user={user} />
  const counts = Object.fromEntries(funnel.map((f) => [f.stage, f.count]))
  const stages = [...STAGES, ...funnel.map((f) => f.stage).filter((s) => !STAGES.includes(s))]
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))
  const maxSkill = Math.max(1, ...top_skills.map((s) => s.count))
  const maxRole = Math.max(1, ...roles.map((r) => r.count))

  return (
    <>
      <header className="greet">
        <p className="kicker dark">{user?.workspace?.name}</p>
        <LineReveal
          label={`${greeting()}, ${firstName(user)}.`}
          lines={[<>{greeting()}, <span className="grad-text">{firstName(user)}.</span></>]}
        />
        <RiseWords
          className="muted greet-sub"
          delay={350}
          text={
            totals.candidates
              ? `You have ${totals.candidates} candidates in your pool and ${totals.active_applications} applications in progress.`
              : 'Your workspace is empty. Upload a first resume or press Guide me to see how it works.'
          }
        />
      </header>

      <HelpBox
        id="home"
        title="This is your home page"
        steps={[
          'To add a new person, open Candidates on the left and press "Upload a resume".',
          'To start hiring for an opening, open Jobs on the left and press "Create a job".',
          'Press the blue "Guide me" button at the top any time for a step-by-step tour.',
        ]}
      >
        The boxes below give a quick count of your hiring. Click a box to see the details.
      </HelpBox>

      <div className="stat-grid" data-tour="stats">
        <StatCard i={0} label="Candidates" value={totals.candidates} hint="People you have added" to="/candidates" />
        <StatCard i={1} label="Returning" value={totals.returning} hint="People who applied again" />
        <StatCard i={2} label="Open jobs" value={totals.open_jobs} hint="Jobs you are hiring for" to="/jobs" />
        <StatCard i={3} label="In progress" value={totals.active_applications} hint={`Still being interviewed · ${totals.hired ?? 0} hired`} />
      </div>

      <div className="dash-grid">
        <section className="card rise" style={{ '--i': 4 }} data-tour="funnel">
          <h2 className="card-title">Where candidates are in hiring</h2>
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

        <section className="card rise" style={{ '--i': 5 }}>
          <h2 className="card-title">Most common skills</h2>
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

        <section className="card rise" style={{ '--i': 6 }}>
          <h2 className="card-title">Types of roles</h2>
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

        <section className="card rise" style={{ '--i': 7 }} data-tour="activity">
          <h2 className="card-title">What happened recently</h2>
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
                    <span className="muted small">
                      {timeAgo(e.created_at)}
                      {e.actor && ` · by ${e.actor === user?.name ? 'you' : e.actor}`}
                    </span>
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

// First-run state for a brand-new, empty workspace.
function Welcome({ user }) {
  const steps = [
    ['01', 'Upload your first resume', 'PDF, Word or text. Contact details, skills, experience and role are filled in automatically.', '/candidates?upload=1', 'Upload resume'],
    ['02', 'Open a job', 'Add a role for a client company with the skills it needs, then track candidates through each interview stage.', '/jobs', 'Create a job'],
    ['03', 'Not sure where to start?', 'Press Guide me in the top bar for a walkthrough of the whole workflow.', null, null],
  ]
  return (
    <>
      <header className="greet">
        <p className="kicker dark">{user?.workspace?.name}</p>
        <LineReveal
          label={`Welcome, ${firstName(user)}.`}
          lines={[<>Welcome, <span className="grad-text">{firstName(user)}.</span></>]}
        />
        <RiseWords className="muted greet-sub" delay={300} text="Your workspace is ready and empty. Everything you see here will come from the resumes and jobs you add." />
      </header>
      <div className="stat-grid" data-tour="stats">
        {['Candidates', 'Returning', 'Open jobs', 'In progress'].map((label, i) => (
          <StatCard key={label} i={i} label={label} value={0} hint="nothing yet" />
        ))}
      </div>
      <div className="welcome-steps">
        {steps.map(([n, title, body, to, cta], i) => (
          <section className="card welcome-step rise" style={{ '--i': i + 4 }} key={n}>
            <span className="how-n">{n}</span>
            <h3>{title}</h3>
            <p className="muted">{body}</p>
            {to && (
              <Link to={to} className={`btn ${i === 0 ? 'btn-primary' : ''}`}>
                {cta}
              </Link>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
