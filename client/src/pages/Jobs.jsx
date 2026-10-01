import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { STAGES, parseSkills, stageSlug, timeAgo } from '../utils.js'
import { useToast } from '../components/Toast.jsx'
import { Modal, PageHeader, PageState, SkillChips } from '../components/ui.jsx'
import HelpBox from '../components/HelpBox.jsx'
import RoundsEditor, { DEFAULT_ROUNDS, cleanRounds } from '../components/RoundsEditor.jsx'

const NEW_COMPANY = '__new'

export default function Jobs() {
  const jobs = useApi(() => api.jobs(), [])
  const [formOpen, setFormOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Every job opening you are hiring for. Click a job to see its candidates."
        actions={
          <button className="btn btn-primary btn-lg" onClick={() => setFormOpen(true)} data-tour="new-job">
            + Create a job
          </button>
        }
      />

      <HelpBox
        id="jobs"
        title="What can I do here?"
        steps={[
          'Press "Create a job" to add a new opening for a client company, with the skills it needs.',
          'Click any job card to open its hiring board and move people from step to step.',
        ]}
      />

      {!jobs.data ? (
        <PageState loading={jobs.loading} error={jobs.error} onRetry={jobs.reload} />
      ) : jobs.data.length === 0 ? (
        <div className="card empty-state">
          <h2>No jobs yet</h2>
          <p className="muted">Create a job to start a pipeline and see matches from the talent pool.</p>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            New job
          </button>
        </div>
      ) : (
        <div className="job-grid">
          {jobs.data.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}

      <Modal open={formOpen} title="Create a job" onClose={() => setFormOpen(false)}>
        <NewJobForm
          onCancel={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false)
            jobs.reload()
          }}
        />
      </Modal>
    </>
  )
}

function JobCard({ job }) {
  const counts = job.stage_counts || {}
  const total = job.total ?? Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <Link to={`/jobs/${job.id}`} className="card job-card link-card">
      <div className="job-card-head">
        <div>
          <h3>{job.title}</h3>
          <p className="muted">{job.company_name}</p>
        </div>
        <span className={`badge badge-${job.status === 'open' ? 'open' : 'closed'}`}>{job.status}</span>
      </div>
      <SkillChips skills={job.required_skills} max={6} />
      <div className="stage-strip" aria-label="Candidates per stage">
        {total > 0 ? (
          (job.stages || STAGES).filter((s) => counts[s]).map((s) => (
            <span
              key={s}
              className={`stage-seg stage-fill-${stageSlug(s)}`}
              style={{ flexGrow: counts[s] }}
              title={`${s}: ${counts[s]}`}
            />
          ))
        ) : (
          <span className="stage-seg empty" />
        )}
      </div>
      <div className="stage-counts">
        {(job.stages || STAGES).filter((s) => counts[s]).map((s) => (
          <span key={s} className="stage-count">
            <i className={`dot stage-fill-${stageSlug(s)}`} />
            {s} {counts[s]}
          </span>
        ))}
      </div>
      <div className="job-card-foot">
        <span className="strong">
          {total} candidate{total === 1 ? '' : 's'}
        </span>
        <span className="muted small">Posted {timeAgo(job.created_at)}</span>
      </div>
    </Link>
  )
}

function NewJobForm({ onCancel, onCreated }) {
  const toast = useToast()
  const companies = useApi(() => api.companies(), [])
  const meta = useApi(() => api.meta(), [])
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [title, setTitle] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [description, setDescription] = useState('')
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const skills = parseSkills(skillsText)
  const isNew = companyId === NEW_COMPANY
  const suggestions = (meta.data?.skills || []).filter((s) => !skills.some((k) => k.toLowerCase() === s.toLowerCase()))

  function addSkill(skill) {
    setSkillsText(skills.length ? `${skills.join(', ')}, ${skill}` : skill)
  }

  async function submit(e) {
    e.preventDefault()
    if (!companyId) return setError('Pick a company.')
    if (isNew && !companyName.trim()) return setError('Enter the company name.')
    if (!title.trim()) return setError('Enter a job title.')
    if (!skills.length) return setError('Add at least one required skill.')
    if (!cleanRounds(rounds).length) return setError('Add at least one interview round.')
    setBusy(true)
    setError('')
    try {
      let cid = Number(companyId)
      if (isNew) {
        const company = await api.createCompany({ name: companyName.trim(), industry: industry.trim() })
        cid = company.id
      }
      const job = await api.createJob({
        company_id: cid,
        title: title.trim(),
        required_skills: skills,
        description: description.trim(),
        rounds: cleanRounds(rounds),
      })
      toast.success('Job created', {
        message: `${job.title} is open. Check the suggested candidates.`,
        link: { to: `/jobs/${job.id}`, label: 'Open the hiring board' },
      })
      onCreated(job)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Company</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Select a company…</option>
          {(companies.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.industry ? ` · ${c.industry}` : ''}
            </option>
          ))}
          <option value={NEW_COMPANY}>+ New company</option>
        </select>
      </label>
      {isNew && (
        <div className="form-row">
          <label className="field">
            <span>Company name</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Fintech" autoFocus />
          </label>
          <label className="field">
            <span>Industry</span>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Fintech" />
          </label>
        </div>
      )}
      <label className="field">
        <span>Job title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Java Developer" />
      </label>
      <label className="field">
        <span>Required skills (comma-separated)</span>
        <input
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="Java, Spring Boot, Microservices, SQL, AWS"
        />
      </label>
      {skills.length > 0 && <SkillChips skills={skills} />}
      {suggestions.length > 0 && (
        <div className="suggest">
          <span className="muted small">Quick add:</span>
          {suggestions.slice(0, 12).map((s) => (
            <button type="button" key={s} className="chip chip-button" onClick={() => addSkill(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <span>Interview rounds for this job</span>
        <span className="muted small">Candidates move through these in order. Use one round or as many as the client needs.</span>
        <RoundsEditor rounds={rounds} onChange={setRounds} />
      </div>
      <label className="field">
        <span>Description</span>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Team, scope, location…" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create job'}
        </button>
      </div>
    </form>
  )
}
