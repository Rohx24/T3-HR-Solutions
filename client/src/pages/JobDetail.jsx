import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { STAGES, formatYears, stageSlug, timeAgo } from '../utils.js'
import { useToast } from '../components/Toast.jsx'
import { MatchScore, PageHeader, PageState, ReturningBadge, SkillChips, StageSelect } from '../components/ui.jsx'

export default function JobDetail() {
  const { id } = useParams()
  const toast = useToast()
  const job = useApi(() => api.job(id), [id])
  const matches = useApi(() => api.matches(id), [id])
  const [overrides, setOverrides] = useState({})
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)
  const [adding, setAdding] = useState(null)

  const j = job.data
  if (!j) return <PageState loading={job.loading} error={job.error} onRetry={job.reload} />

  const applications = (j.applications || []).map((a) => ({ ...a, stage: overrides[a.id] || a.stage }))
  const byStage = Object.fromEntries(STAGES.map((s) => [s, []]))
  for (const a of applications) (byStage[a.stage] ||= []).push(a)

  async function move(app, stage) {
    if (!app || app.stage === stage) return
    setOverrides((o) => ({ ...o, [app.id]: stage }))
    try {
      await api.updateStage(app.id, stage)
      toast.success(`${app.candidate.name} moved to ${stage}`)
      await job.reload()
    } catch (err) {
      toast.error('Could not move candidate', { message: err.message })
    } finally {
      setOverrides((o) => {
        const next = { ...o }
        delete next[app.id]
        return next
      })
    }
  }

  async function addToPipeline(m) {
    setAdding(m.candidate.id)
    try {
      await api.createApplication({ candidate_id: m.candidate.id, job_id: j.id })
      toast.success('Added to pipeline', { message: `${m.candidate.name} · ${m.match_score}% match` })
      job.reload()
      matches.reload()
    } catch (err) {
      toast.error('Could not add candidate', { message: err.message })
    } finally {
      setAdding(null)
    }
  }

  return (
    <>
      <PageHeader
        back={
          <Link to="/jobs" className="back-link">
            ← Jobs
          </Link>
        }
        title={j.title}
        subtitle={`${j.company_name} · ${j.total ?? applications.length} in pipeline · posted ${timeAgo(j.created_at)}`}
      />

      <section className="card job-summary">
        <div>
          <p className="label">Required skills</p>
          <SkillChips skills={j.required_skills} />
        </div>
        {j.description && <p className="muted">{j.description}</p>}
      </section>

      <div className="pipeline-layout">
        <div className="kanban" aria-label="Pipeline" data-tour="kanban">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className={`kanban-col ${overStage === stage ? 'drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(stage)
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault()
                setOverStage(null)
                move(applications.find((a) => a.id === dragId), stage)
                setDragId(null)
              }}
            >
              <div className={`kanban-head stage-border-${stageSlug(stage)}`}>
                <span>{stage}</span>
                <span className="count">{byStage[stage].length}</span>
              </div>
              <div className="kanban-cards">
                {byStage[stage].map((a) => (
                  <div
                    key={a.id}
                    className={`kanban-card ${dragId === a.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setDragId(a.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="kanban-card-top">
                      <Link to={`/candidates/${a.candidate.id}`} className="strong link">
                        {a.candidate.name}
                      </Link>
                      <MatchScore score={a.match_score} />
                    </div>
                    <div className="muted small">
                      {a.candidate.primary_role || 'Role n/a'} · {formatYears(a.candidate.years_experience)}{' '}
                      <ReturningBadge times={a.candidate.times_applied} />
                    </div>
                    <StageSelect value={a.stage} onChange={(s) => move(a, s)} />
                  </div>
                ))}
                {byStage[stage].length === 0 && <div className="kanban-empty">Drop here</div>}
              </div>
            </div>
          ))}
        </div>

        <aside className="card suggestions" data-tour="suggestions">
          <h2 className="card-title">Suggested from talent pool</h2>
          <p className="muted small">Ranked by overlap with this job's required skills.</p>
          {!matches.data ? (
            <PageState loading={matches.loading} error={matches.error} onRetry={matches.reload} />
          ) : matches.data.length === 0 ? (
            <p className="muted">No other candidates in the pool match this job yet.</p>
          ) : (
            <ul className="match-list">
              {matches.data.map((m) => (
                <li key={m.candidate.id} className="match-item">
                  <div className="match-top">
                    <div>
                      <Link to={`/candidates/${m.candidate.id}`} className="strong link">
                        {m.candidate.name}
                      </Link>{' '}
                      <ReturningBadge times={m.candidate.times_applied} />
                      <div className="muted small">
                        {m.candidate.primary_role || 'Role n/a'} · {formatYears(m.candidate.years_experience)}
                        {m.candidate.last_applied_at && ` · active ${timeAgo(m.candidate.last_applied_at)}`}
                      </div>
                    </div>
                    <MatchScore score={m.match_score} />
                  </div>
                  <SkillChips skills={m.matched_skills} variant="match" />
                  {m.missing_skills?.length > 0 && <SkillChips skills={m.missing_skills} variant="missing" />}
                  <button className="btn btn-small btn-primary" onClick={() => addToPipeline(m)} disabled={adding === m.candidate.id}>
                    {adding === m.candidate.id ? 'Adding…' : 'Add to pipeline'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  )
}
