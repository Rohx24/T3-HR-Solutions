import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { formatWhen } from '../components/ScheduleDialog.jsx'
import { StarInput } from '../components/ui.jsx'

// Public page for a client's interviewer (opened from a one-time link, no account needed).

const RESULTS = ['Passed', 'Not passed', 'On hold']

async function call(path, options) {
  const res = await fetch(`/api/public${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong')
  return body
}

export default function FeedbackPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ evaluator_name: '', decision: '', rating: 0, comments: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    call(`/feedback/${encodeURIComponent(token)}`).then(setInfo, (e) => setLoadError(e.message))
  }, [token])

  async function submit(e) {
    e.preventDefault()
    if (!form.evaluator_name.trim()) return setError('Please enter your name.')
    if (!form.decision) return setError('Please choose a result.')
    if (!form.comments.trim()) return setError('Please write a few words about the interview.')
    setBusy(true)
    setError('')
    try {
      await call(`/feedback/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, rating: form.rating || null }),
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public-page">
      <header className="public-head">
        <Logo />
      </header>
      <main className="public-main">
        <div className="card public-card">
          {loadError ? (
            <>
              <h1>Link not available</h1>
              <p className="muted">{loadError}</p>
            </>
          ) : !info ? (
            <p className="muted">Loading…</p>
          ) : done || info.submitted ? (
            <>
              <h1>Thank you!</h1>
              <p>Your feedback for {info.candidate_name} has been sent to the T3Cogno recruiter.</p>
            </>
          ) : info.expired ? (
            <>
              <h1>This link has expired</h1>
              <p className="muted">Please ask the T3Cogno recruiter for a new feedback link.</p>
            </>
          ) : (
            <>
              <p className="kicker">Interview feedback</p>
              <h1>{info.candidate_name}</h1>
              <dl className="kv">
                <dt>Role</dt>
                <dd>
                  {info.job_title} · {info.company_name}
                </dd>
                <dt>Round</dt>
                <dd>{info.round}</dd>
                {info.scheduled_at && (
                  <>
                    <dt>Interview</dt>
                    <dd>{formatWhen(info.scheduled_at)}</dd>
                  </>
                )}
              </dl>
              <form className="form" onSubmit={submit}>
                <label className="field">
                  <span>Your name</span>
                  <input value={form.evaluator_name} onChange={(e) => setForm({ ...form, evaluator_name: e.target.value })} autoFocus />
                </label>
                <div className="field">
                  <span>Result</span>
                  <div className="seg">
                    {RESULTS.map((r) => (
                      <button
                        type="button"
                        key={r}
                        className={`seg-btn ${form.decision === r ? `on ${r.replace(/\s+/g, '-').toLowerCase()}` : ''}`}
                        onClick={() => setForm({ ...form, decision: r })}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Rating (optional)</span>
                  <StarInput value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
                </div>
                <label className="field">
                  <span>How did the interview go?</span>
                  <textarea
                    rows={5}
                    value={form.comments}
                    onChange={(e) => setForm({ ...form, comments: e.target.value })}
                    placeholder="Strengths, gaps, and whether the candidate should move to the next round."
                  />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send feedback'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
