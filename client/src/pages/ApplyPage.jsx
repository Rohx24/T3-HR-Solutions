import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { formatBytes } from '../utils.js'
import '../apply.css'

// Public job apply page (shared as /apply/<token>?src=Naukri). No account needed: the resume is parsed into
// the recruiter's talent pool and the applicant is added to this job's pipeline.

const RESUME_EXTS = ['.pdf', '.docx', '.txt']
const MAX_BYTES = 5 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function call(path, options) {
  const res = await fetch(`/api/public${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.')
  return body
}

const CALL_OPTIONS = [
  {
    value: 'whatsapp',
    title: 'WhatsApp call',
    text: 'We ask for your OK in WhatsApp first.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z" />
        <path d="M9 8.5c0 3.5 2.6 6.5 6 6.8l1.2-1.4-2-1.2-.9.8c-1.2-.5-2.1-1.4-2.6-2.6l.8-.9-1.2-2L9 8.5Z" />
      </svg>
    ),
  },
  {
    value: 'phone',
    title: 'Normal phone call',
    text: 'A regular call to your mobile.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </svg>
    ),
  },
]

export default function ApplyPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const inputRef = useRef(null)
  const [job, setJob] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', contact_preference: '', consent: false, website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    call(`/apply/${encodeURIComponent(token)}`).then(
      (info) => {
        setJob(info)
        document.title = `Apply: ${info.title} · T3Cogno`
      },
      (e) => setLoadError(e.message),
    )
  }, [token])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  function pick(f) {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!RESUME_EXTS.includes(ext)) return setError('Please upload your resume as a PDF, Word (.docx) or text file.')
    if (f.size > MAX_BYTES) return setError(`That file is ${formatBytes(f.size)}. Please keep your resume under 5 MB.`)
    setError('')
    setFile(f)
  }

  async function submit(e) {
    e.preventDefault()
    if (!file) return setError('Please attach your resume.')
    if (form.name.trim().length < 2) return setError('Please enter your full name.')
    if (!EMAIL_RE.test(form.email.trim())) return setError('Please enter a valid email address.')
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Please enter a valid mobile number.')
    if (!form.contact_preference) return setError('Please choose how our recruiter should call you.')
    if (!form.consent) return setError('Please tick the box to agree to be contacted.')
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('resume', file)
      for (const [k, v] of Object.entries(form)) body.append(k, String(v))
      if (params.get('src')) body.append('src', params.get('src'))
      setDone(await call(`/apply/${encodeURIComponent(token)}`, { method: 'POST', body }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public-page apply-page">
      <header className="public-head">
        <Logo />
      </header>

      {loadError ? (
        <main className="apply-narrow">
          <div className="card apply-state">
            <h1>Link not available</h1>
            <p className="muted">{loadError}</p>
          </div>
        </main>
      ) : !job ? (
        <main className="apply-narrow">
          <p className="muted">Loading…</p>
        </main>
      ) : done ? (
        <main className="apply-narrow">
          <div className="card apply-state apply-done">
            <span className="apply-check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1>Thanks{done.first_name ? `, ${done.first_name}` : ''}!</h1>
            <p>
              Your application for <strong>{done.job_title || job.title}</strong> is in.
            </p>
            <ol className="apply-next">
              <li>A T3Cogno recruiter reads your resume.</li>
              {form.contact_preference === 'whatsapp' ? (
                done.whatsapp?.requested ? (
                  <li>
                    <strong>Check WhatsApp now</strong> and tap <strong>Allow</strong> so our recruiter can call you there.
                  </li>
                ) : (
                  <li>If your profile fits, we'll call you on WhatsApp at the number you gave.</li>
                )
              ) : (
                <li>If your profile fits, we'll call your mobile number.</li>
              )}
            </ol>
            {done.whatsapp?.chat_link && (
              <a className="btn btn-primary" href={done.whatsapp.chat_link} target="_blank" rel="noreferrer">
                Say hi on WhatsApp
              </a>
            )}
          </div>
        </main>
      ) : (
        <>
          <section className="apply-hero">
            <div className="apply-wrap">
              <p className="kicker">{job.open ? "We're hiring" : 'Applications closed'}</p>
              <h1>{job.title}</h1>
              <p className="apply-company">{job.company_name} · recruiting through T3Cogno</p>
            </div>
          </section>

          <main className="apply-wrap apply-grid">
            <section className="apply-about">
              {job.required_skills?.length > 0 && (
                <>
                  <p className="label">Skills we're looking for</p>
                  <div className="chips">
                    {job.required_skills.map((s) => (
                      <span className="chip" key={s}>
                        {s}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {job.description && (
                <>
                  <p className="label">About the role</p>
                  <p className="apply-desc">{job.description}</p>
                </>
              )}
              <p className="label">How it works</p>
              <ol className="apply-steps">
                <li>Upload your resume and tell us how to reach you.</li>
                <li>A recruiter reviews your profile.</li>
                <li>If it's a match, we call you the way you prefer.</li>
              </ol>
            </section>

            {job.open ? (
              <form className="card apply-form form" onSubmit={submit} noValidate>
                <h2>Apply in under a minute</h2>

                <div className="field">
                  <span>Your resume</span>
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
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
                  >
                    <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={(e) => pick(e.target.files?.[0])} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                    </svg>
                    {file ? (
                      <>
                        <strong>{file.name}</strong>
                        <p className="muted small">{formatBytes(file.size)} · click to change</p>
                      </>
                    ) : (
                      <>
                        <strong>Upload your resume</strong>
                        <p className="muted small">Click, tap or drag it here · PDF or Word, up to 5 MB</p>
                      </>
                    )}
                  </div>
                </div>

                <label className="field">
                  <span>Full name</span>
                  <input value={form.name} onChange={set('name')} autoComplete="name" />
                </label>
                <div className="form-row">
                  <label className="field">
                    <span>Email</span>
                    <input type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
                  </label>
                  <label className="field">
                    <span>Mobile number</span>
                    <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" placeholder="98450 12345" />
                  </label>
                </div>

                <fieldset className="field apply-choice">
                  <legend>How should our recruiter call you?</legend>
                  <div className="choice-grid">
                    {CALL_OPTIONS.map((o) => (
                      <label key={o.value} className={`choice ${form.contact_preference === o.value ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name="contact_preference"
                          value={o.value}
                          checked={form.contact_preference === o.value}
                          onChange={set('contact_preference')}
                        />
                        <span className="choice-icon" aria-hidden="true">
                          {o.icon}
                        </span>
                        <span className="choice-text">
                          <strong>{o.title}</strong>
                          <small>{o.text}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="consent">
                  <input type="checkbox" checked={form.consent} onChange={set('consent')} />
                  <span>
                    I agree that T3Cogno may contact me about this job and similar roles, and that calls may be recorded so
                    the recruiter can take notes.
                  </span>
                </label>

                {/* Honeypot: hidden from people, filled in by bots. */}
                <label className="hp" aria-hidden="true">
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>

                {error && <p className="form-error">{error}</p>}
                <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send application'}
                </button>
                <p className="muted small apply-privacy">
                  Your details are only shared with the T3Cogno recruiting team for this and similar roles.
                </p>
              </form>
            ) : (
              <div className="card apply-state">
                <h2>This job is no longer accepting applications</h2>
                <p className="muted">Thank you for your interest. Please check with the recruiter for other open roles.</p>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  )
}
