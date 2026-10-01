import { useEffect, useState } from 'react'
import Logo from '../components/Logo.jsx'
import NoticeSections from '../components/NoticeSections.jsx'
import '../apply.css'

// Public notice: how T3Cogno uses call recordings. Linked from the apply page and the consent page.
export default function PrivacyPage() {
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'How we use call recordings · T3Cogno'
    fetch('/api/public/privacy')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load the notice'))))
      .then(setNotice, (e) => setError(e.message))
  }, [])

  return (
    <div className="public-page apply-page">
      <header className="public-head">
        <Logo />
      </header>
      <main className="apply-narrow consent-main">
        <div className="card consent-card">
          <p className="kicker">Privacy</p>
          <h1>How T3Cogno uses call recordings</h1>
          {error && <p className="form-error">{error}</p>}
          {notice && (
            <>
              <NoticeSections notice={notice} />
              <p className="muted small">
                Questions, or want your data deleted? Email{' '}
                <a className="link" href={`mailto:${notice.contact_email}`}>
                  {notice.contact_email}
                </a>
                . Notice version {notice.version}.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
