import { Link, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Candidates from './pages/Candidates.jsx'
import CandidateDetail from './pages/CandidateDetail.jsx'
import Jobs from './pages/Jobs.jsx'
import JobDetail from './pages/JobDetail.jsx'

function NotFound() {
  return (
    <div className="empty-state">
      <h2>Page not found</h2>
      <p>That page doesn't exist.</p>
      <Link className="btn btn-primary" to="/">Back to dashboard</Link>
    </div>
  )
}

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}
