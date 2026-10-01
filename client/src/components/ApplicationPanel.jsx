import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { timeAgo } from '../utils.js'
import { formatWhen } from './ScheduleDialog.jsx'
import { useToast } from './Toast.jsx'
import { MatchScore, Modal, StageBadge, StarInput, Stars } from './ui.jsx'

// Everything about one candidate inside one job, round by round: interviews (with a shareable
// feedback link for the client's interviewer) and the feedback each round received.

const RESULTS = ['Passed', 'Not passed', 'On hold']

function FeedbackForm({ app, job, round, interviewId, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const [result, setResult] = useState('')
  const [rating, setRating] = useState(0)
  const [comments, setComments] = useState('')
  const [who, setWho] = useState(user?.name || '')
  const [company, setCompany] = useState(job.company_name || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!result) return setError('Choose the result of this round.')
    if (!comments.trim()) return setError('Write a few words about how it went.')
    setBusy(true)
    setError('')
    try {
      await api.addNote(app.candidate.id, {
        application_id: app.id,
        round,
        rating: rating || null,
        body: comments.trim(),
        decision: result,
        author: who.trim() || user?.name,
        evaluator_company: company.trim() || null,
        interview_id: interviewId || null,
      })
      toast.success('Feedback saved', { message: `${round}: ${result}` })
      onSaved(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form fb-form" onSubmit={submit}>
      <div className="field">
        <span>Result of this round</span>
        <div className="seg">
          {RESULTS.map((r) => (
            <button type="button" key={r} className={`seg-btn ${result === r ? `on ${r.replace(/\s+/g, '-').toLowerCase()}` : ''}`} onClick={() => setResult(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Rating (optional)</span>
        <StarInput value={rating} onChange={setRating} />
      </div>
      <label className="field">
        <span>How did it go?</span>
        <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Strengths, gaps, and whether they should go to the next round." />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Evaluated by</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Interviewer's name" />
        </label>
        <label className="field">
          <span>Company</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Client company" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save feedback'}
        </button>
      </div>
    </form>
  )
}

function FeedbackLinkButton({ interview }) {
  const toast = useToast()
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)

  async function make() {
    setBusy(true)
    try {
      const { path } = await api.feedbackLink(interview.id)
      const url = `${window.location.origin}${path}`
      setLink(url)
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Feedback link copied', { message: 'Paste it into WhatsApp or email for the interviewer.' })
      } catch {
        toast.info('Feedback link ready', { message: 'Copy it from the box below.' })
      }
    } catch (err) {
      toast.error('Could not create the link', { message: err.message })
    } finally {
      setBusy(false)
    }
  }

  return link ? (
    <div className="fb-link">
      <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Feedback link" />
      <span className="muted small">Send this to the interviewer. They can fill in feedback without logging in. It works once and expires in 21 days.</span>
    </div>
  ) : (
    <button className="btn btn-small" onClick={make} disabled={busy}>
      {busy ? 'Creating…' : 'Get feedback link for interviewer'}
    </button>
  )
}

export default function ApplicationPanel({ app, job, onClose, onChanged, onSchedule, onMove }) {
  const [adding, setAdding] = useState(null)
  const [suggest, setSuggest] = useState(null)

  useEffect(() => {
    setAdding(null)
    setSuggest(null)
  }, [app?.id])

  if (!app) return null
  const rounds = job.rounds
  const fbFor = (r) => (app.feedback || []).filter((f) => f.round === r)
  const ivFor = (r) => (app.interviews || []).filter((i) => i.round === r)
  const nextStage = (r) => job.stages[job.stages.indexOf(r) + 1]

  return (
    <Modal open title={`${app.candidate.name} · ${job.title}`} onClose={onClose} wide>
      <div className="panel-top">
        <div>
          <span className="muted">{app.candidate.primary_role || 'Role not detected'}</span>{' '}
          <MatchScore score={app.match_score} />
        </div>
        <div className="panel-now">
          Now in: <StageBadge stage={app.stage} />
        </div>
        <Link to={`/candidates/${app.candidate.id}`} className="link small" onClick={onClose}>
          Open full profile →
        </Link>
      </div>

      {suggest && (
        <div className="panel-suggest">
          {suggest.result === 'Passed' && suggest.next ? (
            <>
              <span>
                Passed <strong>{suggest.round}</strong>. Move {app.candidate.name.split(' ')[0]} to <strong>{suggest.next}</strong>?
              </span>
              <button className="btn btn-small btn-primary" onClick={() => (onMove(app, suggest.next), setSuggest(null))}>
                Yes, move to {suggest.next}
              </button>
            </>
          ) : suggest.result === 'Not passed' ? (
            <>
              <span>Did not pass {suggest.round}. Mark as Rejected?</span>
              <button className="btn btn-small btn-danger" onClick={() => (onMove(app, 'Rejected'), setSuggest(null))}>
                Yes, mark Rejected
              </button>
            </>
          ) : null}
          <button className="btn btn-small btn-ghost" onClick={() => setSuggest(null)}>
            Not now
          </button>
        </div>
      )}

      <ol className="round-track">
        {rounds.map((r, i) => {
          const fbs = fbFor(r)
          const ivs = ivFor(r)
          const latest = fbs[0]
          const state = latest ? latest.decision?.toLowerCase().replace(/\s+/g, '-') || 'given' : app.stage === r ? 'current' : 'pending'
          return (
            <li key={r} className={`round-step rs-${state}`}>
              <div className="round-step-head">
                <span className="round-step-n">{i + 1}</span>
                <strong>{r}</strong>
                {latest?.decision && <span className={`decision d-${state}`}>{latest.decision}</span>}
                {!latest && app.stage === r && <span className="decision d-current">Current round</span>}
              </div>

              {ivs.map((iv) => (
                <div key={iv.id} className="round-iv">
                  <span>
                    {iv.status === 'completed' ? 'Interview finished' : iv.status === 'cancelled' ? 'Interview cancelled' : 'Interview'}:{' '}
                    <strong>{formatWhen(iv.scheduled_at)}</strong>
                    {iv.interviewer ? ` · ${iv.interviewer}` : ''}
                    {iv.location ? ` · ${iv.location}` : ''}
                  </span>
                  {iv.status !== 'cancelled' && !fbs.some((f) => f.interview_id === iv.id) && <FeedbackLinkButton interview={iv} />}
                </div>
              ))}

              {fbs.map((f) => (
                <div key={f.id} className="round-fb">
                  <div className="round-fb-head">
                    {f.decision && <span className={`decision d-${f.decision.toLowerCase().replace(/\s+/g, '-')}`}>{f.decision}</span>}
                    {f.rating ? <Stars value={f.rating} /> : null}
                    <span className="muted small">
                      {f.author}
                      {f.evaluator_company ? ` (${f.evaluator_company})` : ''} · {timeAgo(f.created_at)}
                    </span>
                  </div>
                  <p className="pre">{f.body}</p>
                </div>
              ))}

              {adding === r ? (
                <FeedbackForm
                  app={app}
                  job={job}
                  round={r}
                  interviewId={ivs.find((iv) => iv.status !== 'cancelled')?.id}
                  onSaved={(result) => {
                    setAdding(null)
                    setSuggest({ result, round: r, next: nextStage(r) })
                    onChanged()
                  }}
                />
              ) : (
                <div className="round-actions">
                  <button className="btn btn-small btn-primary" onClick={() => setAdding(r)}>
                    Add feedback for {r}
                  </button>
                  {!['Hired', 'Rejected'].includes(app.stage) && (
                    <button className="btn btn-small" onClick={() => onSchedule(app, r)}>
                      Schedule {r}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
