import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { formatYears, stageSlug, timeAgo } from '../utils.js'
import { useToast } from '../components/Toast.jsx'
import { MatchScore, Modal, PageHeader, PageState, ReturningBadge, SkillChips, StageSelect } from '../components/ui.jsx'
import RoundsEditor, { cleanRounds } from '../components/RoundsEditor.jsx'
import ScheduleDialog, { formatWhen } from '../components/ScheduleDialog.jsx'
import HelpBox, { stageHelp } from '../components/HelpBox.jsx'

export default function JobDetail() {
  const { id } = useParams()
  const toast = useToast()
  const job = useApi(() => api.job(id), [id])
  const matches = useApi(() => api.matches(id), [id])
  const [overrides, setOverrides] = useState({})
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)
  const [adding, setAdding] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const [editRounds, setEditRounds] = useState(null)
  const [roundsError, setRoundsError] = useState('')

  const j = job.data
  if (!j) return <PageState loading={job.loading} error={job.error} onRetry={job.reload} />

  const applications = (j.applications || []).map((a) => ({ ...a, stage: overrides[a.id] || a.stage }))
  const stages = j.stages
  const byStage = Object.fromEntries(stages.map((s) => [s, []]))
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
        subtitle={`${j.company_name} · ${(n => `${n} ${n === 1 ? 'person' : 'people'}`)(j.total ?? applications.length)} in this job · added ${timeAgo(j.created_at)}`}
      />

      <HelpBox
        id="job-board"
        title="This is the hiring board for this job"
        steps={[
          'Each column is a step in hiring, from left (new) to right (hired). The small text under each name says what the step means.',
          'When someone passes a step, drag their card to the next column, or pick the step from the drop-down on their card.',
          'On the right are people you already have who suit this job. Press "Add to this job" to include them.',
        ]}
      />

      <section className="card job-summary">
        <div>
          <p className="label">Skills this job needs</p>
          <SkillChips skills={j.required_skills} />
        </div>
        <div>
          <p className="label">Interview rounds</p>
          <div className="rounds-inline">
            <span>{['Applied', ...j.rounds, 'Offer', 'Hired'].join('  →  ')}</span>
            <button className="btn btn-small" onClick={() => (setRoundsError(''), setEditRounds([...j.rounds]))}>
              Change rounds
            </button>
          </div>
        </div>
        {j.description && <p className="muted">{j.description}</p>}
      </section>

      <div className="pipeline-layout">
        <div className="kanban" aria-label="Pipeline" data-tour="kanban">
          {stages.map((stage) => (
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
                <span className="stage-name" title={stageHelp(stage)}>
                  {stage}
                  <small>{stageHelp(stage)}</small>
                </span>
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
                    <NextInterview interviews={a.interviews} />
                    <div className="card-actions">
                      <StageSelect value={a.stage} stages={stages} onChange={(s) => move(a, s)} />
                      {!['Hired', 'Rejected'].includes(a.stage) && (
                        <button
                          className="btn btn-small"
                          onClick={() => setScheduling({ id: a.id, stage: a.stage, rounds: j.rounds, name: a.candidate.name })}
                        >
                          Schedule
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {byStage[stage].length === 0 && <div className="kanban-empty">Drag a card here</div>}
              </div>
            </div>
          ))}
        </div>

        <aside className="card suggestions" data-tour="suggestions">
          <h2 className="card-title">Good matches from your candidates</h2>
          <p className="muted small">People you already have, best match first. The % shows how many of this job's skills they have.</p>
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
                    {adding === m.candidate.id ? 'Adding…' : 'Add to this job'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <ScheduleDialog
        application={scheduling}
        title={scheduling ? `Schedule an interview with ${scheduling.name}` : ''}
        onClose={() => setScheduling(null)}
        onSaved={() => job.reload()}
      />

      <Modal open={Boolean(editRounds)} title="Change interview rounds" onClose={() => setEditRounds(null)}>
        {editRounds && (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault()
              setRoundsError('')
              try {
                await api.updateJob(j.id, { rounds: cleanRounds(editRounds) })
                toast.success('Interview rounds updated')
                setEditRounds(null)
                job.reload()
              } catch (err) {
                setRoundsError(err.message)
              }
            }}
          >
            <RoundsEditor rounds={editRounds} onChange={setEditRounds} />
            {roundsError && <p className="form-error">{roundsError}</p>}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditRounds(null)}>
                Cancel
              </button>
              <button className="btn btn-primary">Save rounds</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

// The next scheduled interview on a board card, or the last finished one.
function NextInterview({ interviews = [] }) {
  const upcoming = interviews
    .filter((i) => i.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
  if (upcoming) {
    return (
      <span className="iv-chip" title={upcoming.location || ''}>
        {upcoming.round}: {formatWhen(upcoming.scheduled_at)}
      </span>
    )
  }
  const done = interviews.filter((i) => i.status === 'completed').sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]
  return done ? <span className="iv-chip done">✓ {done.round} finished</span> : null
}
