// All requests go to relative /api/... so the same build works behind the
// Vite dev proxy and when Express serves client/dist in production.

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, options)
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json() : null
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body
}

function json(method, data) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

function query(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== '' && v != null)
  return clean.length ? `?${new URLSearchParams(clean)}` : ''
}

export const api = {
  health: () => request('/health'),
  meta: () => request('/meta'),
  stats: () => request('/stats'),

  candidates: (params) => request(`/candidates${query(params)}`),
  exportUrl: (params) => `/api/candidates/export.csv${query(params)}`,
  candidate: (id) => request(`/candidates/${id}`),
  uploadResume: (file, jobId) => {
    const form = new FormData()
    form.append('resume', file)
    if (jobId) form.append('job_id', jobId)
    return request('/candidates/upload', { method: 'POST', body: form })
  },
  resumeUrl: (id) => `/api/candidates/${id}/resume`,
  addNote: (candidateId, note) => request(`/candidates/${candidateId}/notes`, json('POST', note)),

  companies: () => request('/companies'),
  createCompany: (data) => request('/companies', json('POST', data)),

  jobs: () => request('/jobs'),
  job: (id) => request(`/jobs/${id}`),
  createJob: (data) => request('/jobs', json('POST', data)),
  matches: (jobId) => request(`/jobs/${jobId}/matches`),

  createApplication: (data) => request('/applications', json('POST', data)),
  updateStage: (applicationId, stage) => request(`/applications/${applicationId}`, json('PATCH', { stage })),
}
