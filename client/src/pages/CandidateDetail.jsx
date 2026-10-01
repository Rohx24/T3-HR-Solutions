import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { formatDate, formatYears, initials, timeAgo } from '../utils.js'
import { useToast } from '../components/Toast.jsx'
import NoteForm from '../components/NoteForm.jsx'
import ProfileDetails from '../components/ProfileDetails.jsx'
import HelpBox from '../components/HelpBox.jsx'
import { useAuth } from '../auth.jsx'
import {
  MatchScore,
  PageHeader,
  PageState,
  ReturningBadge,
  SkillChips,
  StageBadge,
  StageSelect,
  Stars,
} from '../components/ui.jsx'

export default function CandidateDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const candidate = useApi(() => api.candidate(id), [id])
  const jobs = useApi(() => api.jobs(), [])
  const [addJobId, setAddJobId] = useState('')
  const [busy, setBusy] = useState(false)

  const c = candidate.data
  if (!c) return <PageState loading={candidate.loading} error={candidate.error} onRetry={candidate.reload} />

  const applications = c.applications || []
  const appliedJobIds = new Set(applications.map((a) => a.job_id))
  const availableJobs = (jobs.data || []).filter((j) => !appliedJobIds.has(j.id) && j.status !== 'closed')

  async function changeStage(app, stage) {
    try {
      await api.updateStage(app.id, stage)
      toast.success(`Moved to ${stage}`, { message: `${app.job_title} · ${app.company_name}` })
      candidate.reload()
    } catch (err) {
      toast.error('Could not change stage', { message: err.message })
    }
  }

  async function addToJob() {
    if (!addJobId) return
    setBusy(true)
    try {
      await api.createApplication({ candidate_id: c.id, job_id: Number(addJobId) })
      const job = availableJobs.find((j) => j.id === Number(addJobId))
      toast.success('Added to pipeline', { message: job ? `${job.title} · ${job.company_name}` : undefined })
      setAddJobId('')
      candidate.reload()
      jobs.reload()
    } catch (err) {
      toast.error('Could not add to job', { message: err.message })
    } finally {
      setBusy(false)
    }
  }

  const timeline = [
    ...(c.notes || []).map((n) => ({ ...n, kind: 'note', key: `n${n.id}` })),
    ...(c.events || []).filter((e) => e.type !== 'note').map((e) => ({ ...e, kind: 'event', key: `e${e.id}` })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <>
      <PageHeader
        back={
          <Link to="/candidates" className="back-link">
            ← Candidates
          </Link>
        }
        title={
          <span className="title-with-badge">
            {c.name} <ReturningBadge times={c.times_applied} />
          </span>
        }
        subtitle={
          <span className="title-with-badge">
            {c.primary_role || 'Role not detected'}
            {c.parsed_by && c.parsed_by !== 'rules' && (
              <span className="ai-badge" title={`Resume details were read by ${c.parsed_by}`}>
                Details read by AI
              </span>
            )}
          </span>
        }
      />

      <HelpBox
        id="candidate"
        title="Everything about this person"
        steps={[
          'Left side: their details, read from the resume.',
          'Right side, "Jobs this person is in": change the step to show how far they have reached.',
          'After an interview, fill in "Write interview feedback" and press Save feedback.',
        ]}
      />

      <div className="detail-grid">
        <div className="stack">
          <section className="card profile-card">
            <span className="avatar avatar-lg">{initials(c.name)}</span>
            <dl className="kv">
              <dt>Email</dt>
              <dd>{c.email ? <a className="link" href={`mailto:${c.email}`}>{c.email}</a> : '-'}</dd>
              <dt>Phone</dt>
              <dd>{c.phone || '-'}</dd>
              <dt>Location</dt>
              <dd>{c.location || '-'}</dd>
              <dt>Experience</dt>
              <dd>{formatYears(c.years_experience)}</dd>
              <dt>Education</dt>
              <dd>{c.education || '-'}</dd>
              <dt>First seen</dt>
              <dd>{formatDate(c.created_at)}</dd>
              <dt>Times applied</dt>
              <dd>{c.times_applied ?? 1}</dd>
            </dl>
            <div>
              <p className="label">Skills</p>
              <SkillChips skills={c.skills} />
            </div>
          </section>

          <ProfileDetails profile={c.profile} />
        </div>

        <div className="stack">
          <section className="card" data-tour="applications">
            <h2 className="card-title">Jobs this person is in</h2>
            {applications.length ? (
              <ul className="app-list">
                {applications.map((a) => (
                  <li key={a.id} className="app-row">
                    <div className="app-info">
                      <Link to={`/jobs/${a.job_id}`} className="strong link">
                        {a.job_title}
                      </Link>
                      <div className="muted small">
                        {a.company_name} · applied {formatDate(a.created_at)}
                      </div>
                    </div>
                    <MatchScore score={a.match_score} />
                    <StageSelect value={a.stage} onChange={(s) => changeStage(a, s)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Not added to any job yet. Choose a job below to add them.</p>
            )}
            <div className="inline-form">
              <select value={addJobId} onChange={(e) => setAddJobId(e.target.value)} aria-label="Add to job">
                <option value="">{availableJobs.length ? 'Choose a job to add them to…' : 'No other open jobs'}</option>
                {availableJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} · {j.company_name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={addToJob} disabled={!addJobId || busy}>
                Add to job
              </button>
            </div>
          </section>

          <section className="card">
            <details className="resume">
              <summary>
                <span className="card-title">Original resume</span>
                {c.has_resume_file && (
                  <a className="btn btn-small" href={api.resumeUrl(c.id)} onClick={(e) => e.stopPropagation()} download>
                    Download original
                  </a>
                )}
              </summary>
              <pre>{c.resume_text || 'No resume text stored.'}</pre>
            </details>
          </section>
          <section className="card" data-tour="note-form">
            <h2 className="card-title">Write interview feedback</h2>
            <NoteForm candidateId={c.id} applications={applications} onSaved={() => candidate.reload()} />
          </section>

          <section className="card">
            <h2 className="card-title">Feedback and history</h2>
            {timeline.length ? (
              <ol className="timeline">
                {timeline.map((item) =>
                  item.kind === 'note' ? (
                    <li key={item.key} className="tl-item tl-note">
                      <div className="tl-head">
                        {item.round && <StageBadge stage={item.round} />}
                        {item.rating ? <Stars value={item.rating} /> : null}
                        <span className="muted small">{timeAgo(item.created_at)}</span>
                      </div>
                      <p className="tl-body">{item.body}</p>
                      <span className="muted small">
                        {item.author || 'Unknown'}
                        {item.job_title ? ` · ${item.job_title}` : ''}
                      </span>
                    </li>
                  ) : (
                    <li key={item.key} className="tl-item tl-event">
                      <p>{item.message}</p>
                      <span className="muted small">
                        {timeAgo(item.created_at)}
                        {item.actor && ` · by ${item.actor === user?.name ? 'you' : item.actor}`}
                      </span>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className="muted">Nothing yet. Feedback you save will appear here.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
