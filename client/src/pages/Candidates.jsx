import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApi, useDebounced } from '../hooks.js'
import { formatYears, initials, timeAgo } from '../utils.js'
import UploadResume from '../components/UploadResume.jsx'
import { PageHeader, PageState, ReturningBadge, SkillChips, Spinner } from '../components/ui.jsx'

export default function Candidates() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const role = params.get('role') || ''
  const skill = params.get('skill') || ''
  const [uploadOpen, setUploadOpen] = useState(false)
  const dq = useDebounced(q)

  const meta = useApi(() => api.meta(), [])
  const list = useApi(() => api.candidates({ q: dq, role, skill }), [dq, role, skill])

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = Boolean(dq || role || skill)
  const candidates = list.data || []

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Every resume you upload lives in one searchable talent pool"
        actions={
          <>
            <a className="btn" href={api.exportUrl({ q: dq, role, skill })} download>
              Export CSV
            </a>
            <button className="btn btn-primary" onClick={() => setUploadOpen(true)} data-tour="upload">
              + Upload resume
            </button>
          </>
        }
      />

      <div className="card toolbar" data-tour="filters">
        <input
          className="search"
          type="search"
          placeholder="Search name, email, skills, resume text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search candidates"
        />
        <select value={role} onChange={(e) => setFilter('role', e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {(meta.data?.roles || []).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select value={skill} onChange={(e) => setFilter('skill', e.target.value)} aria-label="Filter by skill">
          <option value="">All skills</option>
          {(meta.data?.skills || []).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {filtered && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setQ('')
              setParams({}, { replace: true })
            }}
          >
            Clear
          </button>
        )}
      </div>

      {!list.data ? (
        <PageState loading={list.loading} error={list.error} onRetry={list.reload} />
      ) : candidates.length === 0 ? (
        <div className="card empty-state">
          <h2>{filtered ? 'No candidates match these filters' : 'No candidates yet'}</h2>
          <p className="muted">{filtered ? 'Try a different search or clear the filters.' : 'Upload a resume to start the talent pool.'}</p>
          {!filtered && (
            <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
              Upload resume
            </button>
          )}
        </div>
      ) : (
        <div className="card table-card" data-tour="pool">
          <div className="table-meta">
            <span className="muted small">
              {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
            </span>
            {list.loading && <Spinner />}
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Experience</th>
                  <th>Top skills</th>
                  <th className="num">Applications</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td>
                      <div className="person">
                        <span className="avatar">{initials(c.name)}</span>
                        <div>
                          <Link to={`/candidates/${c.id}`} className="strong link" onClick={(e) => e.stopPropagation()}>
                            {c.name}
                          </Link>{' '}
                          <ReturningBadge times={c.times_applied} />
                          <div className="muted small">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{c.primary_role || <span className="muted">-</span>}</td>
                    <td>{formatYears(c.years_experience)}</td>
                    <td>
                      <SkillChips skills={c.skills} max={4} />
                    </td>
                    <td className="num">{c.application_count ?? 0}</td>
                    <td className="muted">{timeAgo(c.last_applied_at || c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UploadResume open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => list.reload()} />
    </>
  )
}
