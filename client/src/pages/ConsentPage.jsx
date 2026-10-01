import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import NoticeSections from '../components/NoticeSections.jsx'
import '../apply.css'

// Public page a candidate opens from the recruiter's message to say whether calls may be recorded.
// Yes and no are equally easy, and the answer can be changed later from the same link.

async function call(path, options) {
  const res = await fetch(`/api/public${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.')
  return body
}

const DONE = {
  granted: {
    title: 'Thank you, your answer is saved',
    text: 'Your recruiter can record calls with you so their notes are accurate. The recording is deleted once the notes are written.',
  },
  refused: {
    title: "Got it, we won't record your calls",
    text: "Your recruiter will take notes by hand instead. This doesn't affect your application in any way.",
  },
}
DONE.withdrawn = DONE.refused

export default function ConsentPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState(null)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Call recording · T3Cogno'
    call(`/consent/${encodeURIComponent(token)}`).then(
      (d) => {
        setInfo(d)
        setStatus(d.status)
      },
      (e) => setLoadError(e.message),
    )
  }, [token])

  async function answer(decision) {
    setBusy(decision)
    setError('')
    try {
      const res = await call(`/consent/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      setStatus(res.status)
      setChanging(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const answered = status && !changing
  const contact = info?.notice?.contact_email

  return (
    <div className="public-page apply-page">
      <header className="public-head">
        <Logo />
      </header>
      <main className="apply-narrow consent-main">
        {loadError ? (
          <div className="card apply-state">
            <h1>Link not available</h1>
            <p className="muted">{loadError}</p>
          </div>
        ) : !info ? (
          <p className="muted">Loading…</p>
        ) : info.expired && !answered ? (
          <div className="card apply-state">
            <h1>This link has expired</h1>
            <p className="muted">Please ask your T3Cogno recruiter to send you a new one.</p>
          </div>
        ) : answered ? (
          <div className={`card apply-state consent-done ${status === 'granted' ? 'yes' : 'no'}`}>
            <span className="apply-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1>{DONE[status].title}</h1>
            <p>{DONE[status].text}</p>
            {!info.expired && (
              <button type="button" className="btn" onClick={() => setChanging(true)}>
                Change my answer
              </button>
            )}
            <p className="muted small">
              Questions, or want your data deleted? Email <a className="link" href={`mailto:${contact}`}>{contact}</a>.{' '}
              <Link className="link" to="/privacy">
                How we use recordings
              </Link>
            </p>
          </div>
        ) : (
          <div className="card consent-card">
            <p className="kicker">Call recording</p>
            <h1>Hi {info.first_name}, can we record our calls with you?</h1>
            <p className="consent-lead">
              A T3Cogno recruiter would like to call you about a job. Here is exactly what happens if you say yes.
            </p>
            <NoticeSections notice={info.notice} />
            <div className="consent-actions">
              <button type="button" className="consent-btn yes" onClick={() => answer('granted')} disabled={Boolean(busy)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {busy === 'granted' ? 'Saving…' : 'Yes, you can record'}
              </button>
              <button type="button" className="consent-btn no" onClick={() => answer('refused')} disabled={Boolean(busy)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
                {busy === 'refused' ? 'Saving…' : "Please don't record"}
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
            <p className="muted small">Either answer is fine and you can change it later from this same link.</p>
          </div>
        )}
      </main>
    </div>
  )
}
