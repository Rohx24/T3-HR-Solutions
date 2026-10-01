import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar, { markToured } from './components/Topbar.jsx'
import { TourProvider, useTour } from './components/Tour.jsx'
import Logo from './components/Logo.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Candidates from './pages/Candidates.jsx'
import CandidateDetail from './pages/CandidateDetail.jsx'
import Jobs from './pages/Jobs.jsx'
import JobDetail from './pages/JobDetail.jsx'
import Landing from './pages/Landing.jsx'
import { Login, Signup } from './pages/AuthPages.jsx'
import FeedbackPage from './pages/FeedbackPage.jsx'
import ApplyPage from './pages/ApplyPage.jsx'

function NotFound() {
  return (
    <div className="empty-state">
      <h2>Page not found</h2>
      <p className="muted">That page doesn't exist in your workspace.</p>
      <Link className="btn btn-primary" to="/">
        Back to dashboard
      </Link>
    </div>
  )
}

// After signing in on /login?next=/jobs/3, continue to where the user was going (same-site paths only).
function AfterSignIn() {
  const next = new URLSearchParams(useLocation().search).get('next') || '/'
  return <Navigate to={next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />
}

function Splash() {
  return (
    <div className="splash">
      <Logo />
    </div>
  )
}

// New accounts get the guide automatically, once.
function AutoTour() {
  const { user, isNew, clearNew } = useAuth()
  const tour = useTour()
  useEffect(() => {
    if (!isNew) return
    const t = setTimeout(() => {
      markToured(user)
      clearNew()
      tour.start()
    }, 900)
    return () => clearTimeout(t)
  }, [isNew]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function AppShell() {
  const location = useLocation()
  return (
    <TourProvider>
      <div className="app">
        <Sidebar />
        <div className="app-main">
          <Topbar />
          <main className="main">
            {/* keyed on the path so each page plays its entrance transition */}
            <div className="page" key={location.pathname}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/candidates" element={<Candidates />} />
                <Route path="/candidates/:id" element={<CandidateDetail />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/login" element={<AfterSignIn />} />
                <Route path="/signup" element={<AfterSignIn />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
      <AutoTour />
    </TourProvider>
  )
}

function PublicRoutes() {
  const location = useLocation()
  const next = encodeURIComponent(location.pathname + location.search)
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="*" element={<Navigate to={`/login?next=${next}`} replace />} />
    </Routes>
  )
}

export default function App() {
  const { status } = useAuth()
  const location = useLocation()
  // The client interviewer's feedback form is public: no sign-in, no app chrome.
  // The job apply page is public too: candidates apply without an account.
  if (location.pathname.startsWith('/apply/')) {
    return (
      <Routes>
        <Route path="/apply/:token" element={<ApplyPage />} />
      </Routes>
    )
  }
  if (location.pathname.startsWith('/feedback/')) {
    return (
      <Routes>
        <Route path="/feedback/:token" element={<FeedbackPage />} />
      </Routes>
    )
  }
  if (status === 'loading') return <Splash />
  return status === 'authed' ? <AppShell /> : <PublicRoutes />
}
