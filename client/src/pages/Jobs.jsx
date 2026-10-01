import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { STAGES, parseSkills, stageSlug, timeAgo } from '../utils.js'
import { useToast } from '../components/Toast.jsx'
import { Modal, PageHeader, PageState, SkillChips } from '../components/ui.jsx'
import HelpBox from '../components/HelpBox.jsx'
import RoundsEditor, { DEFAULT_ROUNDS, cleanRounds } from '../components/RoundsEditor.jsx'
import { jobSummaryLine } from '../components/JobDetails.jsx'

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

      <Modal open={formOpen} title="Create a job" onClose={() => setFormOpen(false)} wide>
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
          {jobSummaryLine(job) && <p className="muted small">{jobSummaryLine(job)}</p>}
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
  const [mode, setMode] = useState('jd')
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [title, setTitle] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [description, setDescription] = useState('')
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS)
  const [details, setDetails] = useState(EMPTY_DETAILS)
  const [showMore, setShowMore] = useState(false)
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState(null)
  const [jdSource, setJdSource] = useState(null)
  const [reading, setReading] = useState(false)
  const [fromJd, setFromJd] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const skills = parseSkills(skillsText)
  const isNew = companyId === NEW_COMPANY
  const suggestions = (meta.data?.skills || []).filter((s) => !skills.some((k) => k.toLowerCase() === s.toLowerCase()))
  const setDetail = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }))

  function addSkill(skill) {
    setSkillsText(skills.length ? `${skills.join(', ')}, ${skill}` : skill)
  }

  // Read the client's job description with AI and fill the form for review.
  async function readJd() {
    if (!jdFile && jdText.trim().length < 40) return setError('Paste the full job description (or choose the file) first.')
    setReading(true)
    setError('')
    try {
      const { draft, parsed_by, warning, jd_text } = await api.parseJobDescription(jdFile ? { file: jdFile } : { text: jdText })
      const match = (companies.data || []).find(
        (c) => draft.company_name && c.name.toLowerCase().trim() === draft.company_name.toLowerCase().trim(),
      )
      if (match) setCompanyId(String(match.id))
      else if (draft.company_name) {
        setCompanyId(NEW_COMPANY)
        setCompanyName(draft.company_name)
        setIndustry(draft.industry || '')
      }
      setTitle(draft.title || '')
      setSkillsText((draft.required_skills || []).join(', '))
      setDescription(draft.summary || '')
      if (draft.interview_rounds?.length) setRounds(draft.interview_rounds)
      setDetails({
        location: draft.location || '',
        work_mode: draft.work_mode && draft.work_mode !== 'Not stated' ? draft.work_mode : '',
        employment_type: draft.employment_type && draft.employment_type !== 'Not stated' ? draft.employment_type : '',
        experience_min: draft.experience_min ?? '',
        experience_max: draft.experience_max ?? '',
        salary: draft.salary || '',
        openings: draft.openings ?? '',
        notice_period: draft.notice_period || '',
        education: draft.education || '',
        nice_to_have: (draft.nice_to_have_skills || []).join(', '),
        responsibilities: (draft.responsibilities || []).join('\n'),
        industry: draft.industry || '',
      })
      setJdSource(jd_text)
      setShowMore(true)
      setFromJd({ ai: parsed_by !== 'rules', warning, roundsFound: Boolean(draft.interview_rounds?.length) })
      setMode('form')
    } catch (err) {
      setError(err.message)
    } finally {
      setReading(false)
    }
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
      const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
      const job = await api.createJob({
        company_id: cid,
        title: title.trim(),
        required_skills: skills,
        description: description.trim(),
        rounds: cleanRounds(rounds),
        details: {
          location: details.location,
          work_mode: details.work_mode,
          employment_type: details.employment_type,
          experience_min: num(details.experience_min),
          experience_max: num(details.experience_max),
          salary: details.salary,
          openings: num(details.openings),
          notice_period: details.notice_period,
          education: details.education,
          industry: details.industry,
          nice_to_have_skills: parseSkills(details.nice_to_have),
          responsibilities: details.responsibilities.split('\n').map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean),
        },
        jd_text: jdSource,
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
    <div className="form">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'jd'} className={`tab ${mode === 'jd' ? 'active' : ''}`} onClick={() => setMode('jd')}>
          From a job description (AI)
        </button>
        <button type="button" role="tab" aria-selected={mode === 'form'} className={`tab ${mode === 'form' ? 'active' : ''}`} onClick={() => setMode('form')}>
          {fromJd ? 'Check and create' : 'Fill in yourself'}
        </button>
      </div>

      {mode === 'jd' ? (
        <div className="form">
          <p className="muted">
            Paste the job description the client sent, or choose the file. The AI fills in the job for you to check. Nothing is
            created until you press <strong>Create job</strong>.
          </p>
          <label className="field">
            <span>Paste the job description</span>
            <textarea
              rows={10}
              value={jdText}
              onChange={(e) => (setJdText(e.target.value), setJdFile(null))}
              placeholder="e.g. We are hiring a Senior Java Developer in Bengaluru (hybrid), 4 to 7 years, budget 18 to 24 LPA. Must have Java, Spring Boot, Microservices…"
            />
          </label>
          <label className="field">
            <span>Or choose the file (PDF, Word or text)</span>
            <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setJdFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={readJd} disabled={reading}>
              {reading ? 'Reading the job description…' : 'Read it with AI'}
            </button>
          </div>
          {reading && <p className="muted small">This usually takes 5 to 15 seconds.</p>}
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          {fromJd && (
            <div className={`callout-inline ${fromJd.warning ? 'warn' : ''}`}>
              {fromJd.warning ||
                `Filled in from the job description${fromJd.ai ? ' by AI' : ''}. Please check everything, especially salary and skills, then press Create job.`}
              {!fromJd.roundsFound && ' The job description did not mention interview rounds, so the standard rounds are set. Change them if the client has different rounds.'}
            </div>
          )}
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
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Fintech" />
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
            <span>Must-have skills (comma-separated)</span>
            <input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Java, Spring Boot, Microservices, SQL, AWS" />
          </label>
          {skills.length > 0 && <SkillChips skills={skills} />}
          {suggestions.length > 0 && !fromJd && (
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
            <span>Short description</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Team, scope, location…" />
          </label>

          <button type="button" className="link-btn more-toggle" onClick={() => setShowMore((v) => !v)}>
            {showMore ? '− Hide more details' : '+ More details (location, experience, salary, openings…)'}
          </button>
          {showMore && (
            <div className="more-details">
              <div className="form-row">
                <label className="field">
                  <span>Location</span>
                  <input value={details.location} onChange={setDetail('location')} placeholder="Bengaluru" />
                </label>
                <label className="field">
                  <span>Work mode</span>
                  <select value={details.work_mode} onChange={setDetail('work_mode')}>
                    <option value="">Not stated</option>
                    <option>On-site</option>
                    <option>Hybrid</option>
                    <option>Remote</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>Experience from (years)</span>
                  <input type="number" min="0" step="0.5" value={details.experience_min} onChange={setDetail('experience_min')} />
                </label>
                <label className="field">
                  <span>Experience up to (years)</span>
                  <input type="number" min="0" step="0.5" value={details.experience_max} onChange={setDetail('experience_max')} />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>Salary / budget</span>
                  <input value={details.salary} onChange={setDetail('salary')} placeholder="18 to 24 LPA" />
                </label>
                <label className="field">
                  <span>Openings</span>
                  <input type="number" min="1" value={details.openings} onChange={setDetail('openings')} />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>Job type</span>
                  <select value={details.employment_type} onChange={setDetail('employment_type')}>
                    <option value="">Not stated</option>
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Internship</option>
                  </select>
                </label>
                <label className="field">
                  <span>Notice period</span>
                  <input value={details.notice_period} onChange={setDetail('notice_period')} placeholder="Immediate to 30 days" />
                </label>
              </div>
              <label className="field">
                <span>Education</span>
                <input value={details.education} onChange={setDetail('education')} placeholder="B.Tech / B.E. or equivalent" />
              </label>
              <label className="field">
                <span>Good-to-have skills (comma-separated)</span>
                <input value={details.nice_to_have} onChange={setDetail('nice_to_have')} placeholder="Kafka, AWS" />
              </label>
              <label className="field">
                <span>Responsibilities (one per line)</span>
                <textarea rows={4} value={details.responsibilities} onChange={setDetail('responsibilities')} />
              </label>
            </div>
          )}

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
      )}
    </div>
  )
}

const EMPTY_DETAILS = {
  location: '', work_mode: '', employment_type: '', experience_min: '', experience_max: '', salary: '', openings: '',
  notice_period: '', education: '', nice_to_have: '', responsibilities: '', industry: '',
}
