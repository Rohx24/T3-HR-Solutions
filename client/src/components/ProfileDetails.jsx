import { SkillChips } from './ui.jsx'

// The detailed profile read from the resume by the AI parser (GPT-4o mini). Every section only
// appears when the resume actually contained that information.

const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '')

function safeUrl(raw) {
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function Section({ title, children }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  )
}

const dates = (start, end, current) => [start, current ? 'Present' : end].filter(Boolean).join(' – ')

export default function ProfileDetails({ profile: p }) {
  if (!p) return null

  const facts = [
    ['Profession', p.primary_role],
    ['Field', p.role_category],
    ['Level', p.seniority],
    ['Current job', [p.current_title, p.current_company].filter(Boolean).join(' at ')],
    ['Industries', (p.industries || []).join(', ')],
    ['Notice period', p.notice_period],
    ['Current salary', p.current_ctc],
    ['Expected salary', p.expected_ctc],
    ['Preferred locations', (p.preferred_locations || []).join(', ')],
    ['Can relocate', p.willing_to_relocate === null || p.willing_to_relocate === undefined ? null : p.willing_to_relocate ? 'Yes' : 'No'],
  ].filter(([, v]) => has(v))

  const links = [
    ['LinkedIn', p.links?.linkedin],
    ['GitHub', p.links?.github],
    ['Portfolio', p.links?.portfolio],
    ...(p.links?.other || []).map((u) => ['Link', u]),
  ]
    .map(([label, u]) => [label, safeUrl(u), u])
    .filter(([, href]) => href)

  return (
    <>
      <Section title="Summary">
        {p.headline && <p className="profile-headline">{p.headline}</p>}
        {p.summary && <p>{p.summary}</p>}
        {facts.length > 0 && (
          <dl className="kv kv-spaced">
            {facts.map(([k, v]) => (
              <div className="kv-row" key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {has(p.experience) && (
        <Section title="Work experience">
          <ol className="exp-list">
            {p.experience.map((x, i) => (
              <li key={i} className="exp-item">
                <div className="exp-head">
                  <div>
                    <strong>{x.title || 'Role'}</strong>
                    {x.company && <span className="muted"> · {x.company}</span>}
                  </div>
                  <span className="muted small exp-dates">{dates(x.start, x.end, x.is_current)}</span>
                </div>
                {(x.location || x.employment_type) && (
                  <p className="muted small">{[x.employment_type, x.location].filter(Boolean).join(' · ')}</p>
                )}
                {has(x.highlights) && (
                  <ul className="exp-points">
                    {x.highlights.map((h, j) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                )}
                {has(x.skills_used) && <SkillChips skills={x.skills_used} />}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {has(p.education) && (
        <Section title="Education">
          <ul className="plain-list">
            {p.education.map((e, i) => (
              <li key={i}>
                <strong>{[e.degree, e.field].filter(Boolean).join(', ') || 'Qualification'}</strong>
                <span className="muted small">
                  {[e.institution, [e.start_year, e.end_year].filter(Boolean).join(' – '), e.grade].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(has(p.tools) || has(p.domain_expertise) || has(p.soft_skills) || has(p.languages)) && (
        <Section title="More skills">
          {[
            ['Tools and software', p.tools],
            ['Specialisations', p.domain_expertise],
            ['Soft skills', p.soft_skills],
            ['Languages', p.languages],
          ]
            .filter(([, v]) => has(v))
            .map(([label, v]) => (
              <div className="skill-group" key={label}>
                <p className="label">{label}</p>
                <SkillChips skills={v} />
              </div>
            ))}
        </Section>
      )}

      {has(p.certifications) && (
        <Section title="Certificates and licences">
          <ul className="plain-list">
            {p.certifications.map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>
                <span className="muted small">{[c.issuer, c.year].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {has(p.projects) && (
        <Section title="Projects">
          <ul className="plain-list">
            {p.projects.map((x, i) => (
              <li key={i}>
                <strong>{x.name || 'Project'}</strong>
                {x.description && <span>{x.description}</span>}
                {has(x.skills_used) && <SkillChips skills={x.skills_used} />}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(has(p.achievements) || has(p.publications) || has(p.volunteering) || has(p.interests)) && (
        <Section title="Achievements and more">
          {[
            ['Achievements', p.achievements],
            ['Publications', p.publications],
            ['Volunteering', p.volunteering],
            ['Interests', p.interests],
          ]
            .filter(([, v]) => has(v))
            .map(([label, v]) => (
              <div className="skill-group" key={label}>
                <p className="label">{label}</p>
                <ul className="exp-points">
                  {v.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
        </Section>
      )}

      {links.length > 0 && (
        <Section title="Links">
          <ul className="plain-list">
            {links.map(([label, href, raw]) => (
              <li key={href}>
                <span className="muted small">{label}</span>
                <a className="link" href={href} target="_blank" rel="noopener noreferrer nofollow">
                  {raw}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
