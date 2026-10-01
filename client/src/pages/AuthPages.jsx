import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Logo from '../components/Logo.jsx'
import { LineReveal, RiseWords } from '../components/TextFx.jsx'

function AuthLayout({ title, accent, lede, children }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <Link to="/" className="auth-logo" aria-label="Home">
          <Logo light />
        </Link>
        <div className="auth-art-copy">
          <p className="kicker">T3Cogno Talent</p>
          <LineReveal
            label={`${title} ${accent}`}
            delay={100}
            lines={[title, <span className="grad-text" key="a">{accent}</span>]}
          />
          <RiseWords className="auth-lede" delay={450} text={lede} />
        </div>
        <ul className="auth-points">
          <li>Private workspace per account</li>
          <li>Resume parsing in seconds</li>
          <li>Interview rounds, comments, ratings</li>
          <li>Talent pool matching for new jobs</li>
        </ul>
      </aside>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  )
}

// "Continue with Google". With GOOGLE_CLIENT_ID set on the server this renders Google's official
// button (Google Identity Services); until then a standard-looking button explains it is not enabled yet.
function GoogleButton({ clientId, onError, label = 'Continue with Google' }) {
  const ref = useRef(null)
  const { google } = useAuth()
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGoogleScript().then(() => {
      if (cancelled || !ref.current || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => google(credential).catch((e) => onError(e.message)),
      })
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: Math.min(400, ref.current.offsetWidth || 400),
      })
    }, () => onError('Could not load Google sign-in. Check your connection and try again.'))
    return () => {
      cancelled = true
    }
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {clientId ? (
        <div className="google-btn" ref={ref} />
      ) : (
        <button
          type="button"
          className="google-fallback"
          onClick={() => onError('Google sign-in is being set up for T3Cogno and will be available shortly. Please use email for now.')}
        >
          <GoogleG />
          {label}
        </button>
      )}
      <div className="divider">
        <span>or continue with email</span>
      </div>
    </>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

let googleScript
function loadGoogleScript() {
  googleScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return googleScript
}

function useAuthConfig() {
  const [config, setConfig] = useState({ google_client_id: null, demo: null })
  useEffect(() => {
    api.authConfig().then(setConfig, () => {})
  }, [])
  return config
}

function PasswordField({ value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
      <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const config = useAuthConfig()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wantsDemo = params.get('demo') === '1'

  async function submit(e, creds = { email, password }) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(creds.email, creds.password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome" accent="back." lede="Sign in to your T3Cogno workspace and pick up where your team left off.">
      <h2>Sign in</h2>
      <p className="muted auth-sub">
        New here? <Link to="/signup" className="link strong">Create a workspace</Link>
      </p>

      {config.demo && (
        <button
          type="button"
          className={`demo-btn ${wantsDemo ? 'highlight' : ''}`}
          onClick={() => submit(null, config.demo)}
          disabled={busy}
        >
          <span>
            <strong>Explore the demo workspace</strong>
            <span className="muted small">Sample candidates, jobs and interview notes. No sign-up needed.</span>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      <GoogleButton clientId={config.google_client_id} onError={setError} />

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Work email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@t3cogno.com" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}

export function Signup() {
  const { signup } = useAuth()
  const config = useAuthConfig()
  const [form, setForm] = useState({ name: '', email: '', password: '', workspace_name: '', sample_data: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const strength = passwordStrength(form.password)

  async function submit(e) {
    e.preventDefault()
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    setError('')
    try {
      await signup(form)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your" accent="workspace." lede="A private talent pool and hiring pipelines for your team. Set-up takes under a minute.">
      <h2>Create account</h2>
      <p className="muted auth-sub">
        Already have one? <Link to="/login" className="link strong">Sign in</Link>
      </p>

      <GoogleButton clientId={config.google_client_id} onError={setError} label="Sign up with Google" />

      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={set('name')} autoComplete="name" placeholder="Your full name" required autoFocus />
        </label>
        <label className="field">
          <span>Work email</span>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@t3cogno.com" required />
        </label>
        <label className="field">
          <span>Password</span>
          <PasswordField value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} autoComplete="new-password" placeholder="At least 8 characters" />
          {form.password && (
            <span className={`pw-meter s${strength.score}`}>
              <i />
              <i />
              <i />
              <i />
              <em>{strength.label}</em>
            </span>
          )}
        </label>
        <label className="field">
          <span>
            Company or team name <span className="muted">(optional)</span>
          </span>
          <input value={form.workspace_name} onChange={set('workspace_name')} placeholder="e.g. T3Cogno Talent Team" />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.sample_data} onChange={set('sample_data')} />
          <span>
            <strong>Start with sample data</strong>
            <span className="muted small">Example candidates, jobs and interview notes so you can try everything. Recommended.</span>
          </span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creating your workspace…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}

function passwordStrength(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length < 8) score = 0
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}
