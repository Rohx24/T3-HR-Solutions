import { Link } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { LineReveal, Reveal, RiseWords } from '../components/TextFx.jsx'

const STEPS = [
  ['01', 'Upload resumes', 'Drop in PDF, Word or text resumes. Contact details, skills, experience and primary role are extracted automatically.'],
  ['02', 'Run interview rounds', 'Move every candidate from Applied to Hired on one board, with a comment and rating recorded after each round.'],
  ['03', 'Recognise returning talent', 'When someone applies again, their profile is updated rather than duplicated, and their full history is kept.'],
  ['04', 'Reuse for the next client', 'Each new job lists the strongest matches already in your pool, ranked by skills, so every search starts with a shortlist.'],
]

const FACTS = [
  ['100+', 'client companies served by T3Cogno'],
  ['7', 'pipeline stages, Applied to Hired'],
  ['3', 'resume formats parsed: PDF, DOCX, TXT'],
  ['1', 'shared talent pool across every client'],
]

const LANES = [
  ['Screening', [['Ananya Iyer', 'Python Developer', 83], ['Divya Menon', 'Python Developer', 67]]],
  ['Technical', [['Karthik Rao', 'Java Developer', 67], ['Meera Nair', 'Full Stack Developer', 50]]],
  ['Offer', [['Rahul Verma', 'Frontend Developer', 100]]],
]

export default function Landing() {
  return (
    <div className="landing">
      <div className="utility-bar">
        <span>T3Cogno · Complete HR Service Solutions</span>
        <a href="https://www.t3cogno.com/" target="_blank" rel="noreferrer">
          t3cogno.com ↗
        </a>
      </div>

      <header className="land-nav">
        <Logo />
        <nav>
          <a href="#how" className="nav-text">
            How it works
          </a>
          <Link to="/login" className="nav-text">
            Sign in
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Talent acquisition platform</p>
          <LineReveal
            className="hero-title"
            label="Hire smarter from the talent you already have."
            delay={150}
            lines={['Hire smarter from', 'the talent you', <span className="grad-text" key="g">already have.</span>]}
          />
          <RiseWords
            className="hero-lede"
            delay={650}
            text="One workspace for T3Cogno recruiters to parse resumes, run every interview round, and put past candidates forward for new clients."
          />
          <div className="hero-ctas">
            <Link to="/signup" className="btn btn-primary btn-lg">
              Create your workspace
            </Link>
            <Link to="/login?demo=1" className="btn btn-ghost-light btn-lg">
              Explore the demo <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="hero-preview" aria-hidden="true">
          <div className="hp-bar">
            <span className="hp-dots">
              <i />
              <i />
              <i />
            </span>
            <span>Hiring pipeline · all open jobs</span>
          </div>
          <div className="hp-lanes">
            {LANES.map(([stage, cards], c) => (
              <div className="hp-lane" key={stage}>
                <span className="hp-stage">
                  {stage} <em>{cards.length}</em>
                </span>
                {cards.map(([name, role, score], i) => (
                  <div className="hp-card" key={name} style={{ animationDelay: `${900 + c * 140 + i * 110}ms` }}>
                    <strong>{name}</strong>
                    <span>{role}</span>
                    <b>{score}% match</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="facts">
        {FACTS.map(([n, label], i) => (
          <Reveal className="fact" key={label} delay={i * 80}>
            <strong>{n}</strong>
            <span>{label}</span>
          </Reveal>
        ))}
      </section>

      <section className="how" id="how">
        <Reveal className="section-head">
          <p className="kicker dark">How it works</p>
          <h2>From resume to offer, in four steps.</h2>
        </Reveal>
        <div className="how-grid">
          {STEPS.map(([n, title, body], i) => (
            <Reveal className="how-step" key={n} delay={i * 100}>
              <span className="how-n">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="land-cta">
        <Reveal>
          <p className="kicker">Get started</p>
          <h2>Your private workspace is ready in under a minute.</h2>
          <p className="cta-sub">Start with sample data or an empty pool. The Guide me button walks you through every step.</p>
          <div className="hero-ctas">
            <Link to="/signup" className="btn btn-primary btn-lg">
              Create your workspace
            </Link>
            <Link to="/login" className="btn btn-ghost-light btn-lg">
              Sign in
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="land-foot">
        <Logo light />
        <span>© {new Date().getFullYear()} T3Cogno. Applicant tracking for the talent acquisition practice.</span>
      </footer>
    </div>
  )
}
