import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { formatYears } from '../utils.js'
import { useToast } from './Toast.jsx'
import { Modal, ReturningBadge, SkillChips, StageBadge } from './ui.jsx'

const ALLOWED = ['.pdf', '.docx', '.txt']
const MAX_BYTES = 5 * 1024 * 1024

function validate(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED.includes(ext)) return 'Only .pdf, .docx and .txt files are supported.'
  if (file.size > MAX_BYTES) return 'File is larger than 5 MB.'
  return null
}

export default function UploadResume({ open, onClose, onUploaded, defaultJobId = '' }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const jobs = useApi(() => (open ? api.jobs() : Promise.resolve(null)), [open])
  const [file, setFile] = useState(null)
  const [jobId, setJobId] = useState(defaultJobId)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  function reset() {
    setFile(null)
    setJobId(defaultJobId)
    setError('')
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function close() {
    reset()
    onClose()
  }

  function pick(f) {
    if (!f) return
    const problem = validate(f)
    setError(problem || '')
    setFile(problem ? null : f)
  }

  async function submit(e) {
    e.preventDefault()
    if (!file) return setError('Choose a resume first.')
    setBusy(true)
    setError('')
    try {
      const res = await api.uploadResume(file, jobId)
      setResult(res)
      const c = res.candidate
      if (res.returning) {
        toast.success('Returning candidate updated', { message: `${c.name}'s profile was refreshed, history kept.` })
      } else {
        toast.success('New candidate', { message: `${c.name} added to the talent pool.` })
      }
      onUploaded?.(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openJobs = (jobs.data || []).filter((j) => j.status !== 'closed')

  return (
    <Modal open={open} title={result ? 'Resume parsed' : 'Upload resume'} onClose={close}>
      {result ? (
        <ParsedResult result={result} onAnother={reset} onClose={close} />
      ) : (
        <form onSubmit={submit} className="form">
          <div
            className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pick(e.dataTransfer.files?.[0])
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              hidden
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span className="muted small">{(file.size / 1024).toFixed(0)} KB · click to change</span>
              </>
            ) : (
              <>
                <strong>Drop a resume here or click to browse</strong>
                <span className="muted small">PDF, DOCX or TXT, up to 5 MB</span>
              </>
            )}
          </div>

          <label className="field">
            <span>Apply to job (optional)</span>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Just add to talent pool</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.company_name}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !file}>
              {busy ? 'Parsing…' : 'Upload & parse'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function ParsedResult({ result, onAnother, onClose }) {
  const c = result.candidate
  return (
    <div className="parsed">
      <div className={`parsed-banner ${result.returning ? 'returning' : 'new'}`}>
        {result.returning
          ? `Returning candidate: existing profile updated (applied ${c.times_applied} times).`
          : 'New candidate added to the talent pool.'}
      </div>
      <div className="parsed-head">
        <div>
          <h3>
            {c.name} <ReturningBadge times={c.times_applied} />
          </h3>
          <p className="muted">
            {c.primary_role || 'Role not detected'} · {formatYears(c.years_experience)}
          </p>
        </div>
      </div>
      <dl className="kv">
        <dt>Email</dt>
        <dd>{c.email || '-'}</dd>
        <dt>Phone</dt>
        <dd>{c.phone || '-'}</dd>
        <dt>Location</dt>
        <dd>{c.location || '-'}</dd>
        <dt>Education</dt>
        <dd>{c.education || '-'}</dd>
      </dl>
      <div>
        <p className="label">Skills detected</p>
        <SkillChips skills={c.skills} />
      </div>
      {result.application && (
        <p className="muted small">
          Added to pipeline <StageBadge stage={result.application.stage || 'Applied'} />
          {result.application.match_score != null && ` · ${result.application.match_score}% match`}
        </p>
      )}
      <div className="form-actions">
        <button className="btn" onClick={onAnother}>
          Upload another
        </button>
        <Link className="btn btn-primary" to={`/candidates/${c.id}`} onClick={onClose}>
          View profile
        </Link>
      </div>
    </div>
  )
}
