// Demo data. Resumes go through the real parser + services so seeded data looks exactly like uploads.
// Run `npm run seed` to wipe and re-seed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, tx, UPLOAD_DIR } from './db.js';
import { parseResume } from './parser.js';
import { upsertCandidate, addApplication, moveStage, addNote, createCompany, createJob } from './services.js';

const RESUMES = {
  priya2024: `Priya Sharma
Java Developer | Bengaluru, India
priya.sharma@example.com | +91 98450 12345
SUMMARY
Java developer with 3 years of experience building REST APIs and backend services.
SKILLS
Core Java, Spring Boot, Hibernate, MySQL, REST API, Maven, Git, JUnit
EXPERIENCE
Software Engineer, Infosys, Bengaluru (2021 - Present)
- Built Spring Boot microservices for a retail banking client
- Maintained CI pipelines in Jenkins
EDUCATION
B.Tech, Computer Science (2021)`,

  karthik: `Karthik Rao
Senior Java Engineer - Hyderabad
karthik.rao@example.com | +91 99000 45678
6+ years of experience designing high-throughput payment systems.
Skills: Java, Spring Boot, Microservices, Apache Kafka, Oracle, PL/SQL, Docker, Redis, JUnit
Experience: Lead Engineer, PayCore Systems (2019 - Present)
Education: M.Tech, Software Systems`,

  ananya: `Ananya Iyer
Python Developer | Chennai
ananya.iyer@example.com | +91 98840 22113
4 years of experience building healthcare data APIs.
Technical Skills: Python, Django, Django REST framework, REST APIs, PostgreSQL, Celery, Redis, Docker, AWS (EC2, S3)
Experience: Backend Engineer, MedTrack (2022 - Present)
Education: B.E. Computer Science`,

  rahul: `Rahul Verma
Frontend Developer, Pune
rahul.verma@example.com | +91 97300 66554
3 years of experience shipping React apps used by 1M+ shoppers.
Skills: React, TypeScript, JavaScript (ES6), Redux, HTML5, CSS3, Jest, Figma, Git
Experience: SDE-1 Frontend, ShopKart (2023 - Present)
Education: B.Sc Computer Science`,

  sneha: `Sneha Kulkarni
Data Scientist | Mumbai
sneha.kulkarni@example.com | +91 98200 77889
2 years of experience in churn prediction and demand forecasting.
Skills: Python, Pandas, NumPy, scikit-learn, TensorFlow, Machine Learning, SQL, Tableau
Experience: Data Scientist, RetailIQ (2024 - Present)
Education: M.Sc Statistics`,

  vikram2024: `Vikram Singh
DevOps Engineer - Gurugram
vikram.singh@example.com | +91 98110 33445
4 years of experience running production Kubernetes clusters.
Skills: AWS, Docker, Kubernetes, Jenkins, Linux, Python, CI/CD
Education: B.Tech Information Technology`,

  vikram2025: `Vikram Singh
Senior DevOps Engineer - Gurugram
vikram.singh@example.com | +91 98110 33445
5 years of experience running production Kubernetes clusters on AWS.
Skills: AWS, Docker, Kubernetes (EKS), Terraform, Ansible, Jenkins, GitHub Actions, Linux, Python, CI/CD
Education: B.Tech Information Technology`,

  meera: `Meera Nair
Full Stack Developer | Kochi
meera.nair@example.com | +91 94470 11223
4 years of experience building SaaS dashboards end to end.
Skills: React, TypeScript, Node.js, Express.js, MongoDB, GraphQL, HTML, CSS, Docker, AWS
Experience: Full Stack Engineer, CloudLedger (2022 - Present)
Education: B.Tech Computer Science`,

  rohan: `Rohan Das
QA Automation Engineer - Kolkata
rohan.das@example.com | +91 98300 99001
3 years of experience in test automation for banking apps.
Skills: Selenium, Java, Automation Testing, Manual Testing, Postman, JMeter, SQL, Jira, Agile
Education: B.E. Electronics`,

  divya: `Divya Menon
Python Developer | Bengaluru
divya.menon@example.com | +91 99860 44556
2 years of experience building internal tools and APIs.
Skills: Python, Flask, FastAPI, MySQL, Docker, AWS, Git
Education: B.Tech Computer Science`,

  siddharth: `Siddharth Jain
Java Developer | Noida
siddharth.jain@example.com | +91 98710 55667
1 year of experience as a backend intern turned engineer.
Skills: Java, Spring Boot, Hibernate, MySQL, HTML, CSS
Education: B.Tech Computer Science`,
};

const d = (s) => new Date(s).toISOString();
const candidate = (key, at) => upsertCandidate(parseResume(RESUMES[key]), {}, d(at)).id;

export function seed() {
  tx(() => {
    const acme = createCompany({ name: 'Acme Fintech', industry: 'Fintech' }, d('2024-06-01')).id;
    const nimbus = createCompany({ name: 'Nimbus Health', industry: 'Healthcare' }, d('2025-01-10')).id;
    const orbit = createCompany({ name: 'Orbit Retail', industry: 'E-commerce' }, d('2024-06-01')).id;

    const orbitJava = createJob({
      company_id: orbit, title: 'Java Backend Engineer', status: 'closed',
      required_skills: ['Java', 'Spring Boot', 'MySQL', 'REST API'], description: 'Order management backend (2024 hiring drive).',
    }, d('2024-08-01')).id;
    const acmeJava = createJob({
      company_id: acme, title: 'Senior Java Developer',
      required_skills: ['Java', 'Spring Boot', 'Microservices', 'SQL', 'AWS', 'Kafka'], description: 'Payments platform team. 4+ years.',
    }, d('2026-09-20')).id;
    const nimbusPy = createJob({
      company_id: nimbus, title: 'Python Backend Engineer',
      required_skills: ['Python', 'Django', 'PostgreSQL', 'REST API', 'Docker', 'AWS'], description: 'Patient records APIs.',
    }, d('2026-09-18')).id;
    const orbitFe = createJob({
      company_id: orbit, title: 'Frontend Engineer (React)',
      required_skills: ['React', 'TypeScript', 'JavaScript', 'CSS', 'Redux', 'Jest'], description: 'Storefront web app.',
    }, d('2026-09-15')).id;

    // 2024: Priya interviews at Orbit, gets an offer, declines. Stays in the pool.
    const priya = candidate('priya2024', '2024-08-12');
    const pApp = addApplication(priya, orbitJava, d('2024-08-14')).id;
    moveStage(pApp, 'Screening', d('2024-08-16'));
    addNote(priya, { application_id: pApp, author: 'Rohit', rating: 4, body: 'Clear communicator, 3 yrs Spring Boot. Move to technical.' }, d('2024-08-16'));
    moveStage(pApp, 'Technical', d('2024-08-21'));
    addNote(priya, { application_id: pApp, author: 'Ananth (Tech Panel)', rating: 4, body: 'Strong on REST + JPA. Needs more exposure to messaging (Kafka).' }, d('2024-08-21'));
    moveStage(pApp, 'HR Round', d('2024-08-26'));
    moveStage(pApp, 'Offer', d('2024-08-30'));
    moveStage(pApp, 'Rejected', d('2024-09-05'));
    addNote(priya, { application_id: pApp, round: 'Offer', author: 'Rohit', body: 'Declined offer: accepted counter-offer from Infosys. Great profile, re-engage later.' }, d('2024-09-05'));

    // Vikram applied in 2024 and came back in Dec 2025 with an updated resume (returning candidate).
    candidate('vikram2024', '2024-11-05');
    candidate('vikram2025', '2025-12-10');

    candidate('sneha', '2025-06-18');
    candidate('rohan', '2025-09-03');

    // Acme: Senior Java Developer
    const karthik = candidate('karthik', '2026-09-21');
    const kApp = addApplication(karthik, acmeJava, d('2026-09-21')).id;
    moveStage(kApp, 'Screening', d('2026-09-23'));
    addNote(karthik, { application_id: kApp, author: 'Rohit', rating: 4, body: 'Solid payments + microservices background. Notice period 30 days.' }, d('2026-09-23'));
    moveStage(kApp, 'Technical', d('2026-09-26'));
    addNote(karthik, { application_id: kApp, author: 'Ananth (Tech Panel)', rating: 4, body: 'Good Kafka depth; system design was average. Recommend HR round.' }, d('2026-09-26'));

    const sid = candidate('siddharth', '2026-09-22');
    const sApp = addApplication(sid, acmeJava, d('2026-09-22')).id;
    moveStage(sApp, 'Screening', d('2026-09-24'));
    moveStage(sApp, 'Rejected', d('2026-09-24'));
    addNote(sid, { application_id: sApp, round: 'Screening', author: 'Sushrith', rating: 3, body: 'Only 1 yr experience; role needs 4+. Keep in pool for junior openings.' }, d('2026-09-24'));

    // Nimbus: Python Backend Engineer
    const ananya = candidate('ananya', '2026-09-19');
    const aApp = addApplication(ananya, nimbusPy, d('2026-09-19')).id;
    moveStage(aApp, 'Screening', d('2026-09-25'));
    addNote(ananya, { application_id: aApp, author: 'Sushrith', rating: 5, body: 'Exact stack match (Django + Postgres + Celery). Fast-track to technical.' }, d('2026-09-25'));

    const divya = candidate('divya', '2026-09-28');
    addApplication(divya, nimbusPy, d('2026-09-28'));

    // Orbit: Frontend Engineer (React)
    const rahul = candidate('rahul', '2026-09-16');
    const rApp = addApplication(rahul, orbitFe, d('2026-09-16')).id;
    moveStage(rApp, 'Screening', d('2026-09-17'));
    moveStage(rApp, 'Technical', d('2026-09-20'));
    addNote(rahul, { application_id: rApp, author: 'Ananth (Tech Panel)', rating: 5, body: 'Excellent React/TS fundamentals, clean component design, good testing habits.' }, d('2026-09-20'));
    moveStage(rApp, 'HR Round', d('2026-09-24'));
    addNote(rahul, { application_id: rApp, author: 'Rohit', rating: 4, body: 'Expected CTC within band. Can join in 3 weeks.' }, d('2026-09-24'));
    moveStage(rApp, 'Offer', d('2026-09-29'));

    const meera = candidate('meera', '2026-09-27');
    const mApp = addApplication(meera, orbitFe, d('2026-09-27')).id;
    moveStage(mApp, 'Screening', d('2026-09-28'));
    addNote(meera, { application_id: mApp, author: 'Sushrith', rating: 4, body: 'Full stack, strong React. Missing Redux/Jest but quick learner.' }, d('2026-09-28'));
    moveStage(mApp, 'Technical', d('2026-09-30'));
  });
}

export function reset() {
  db.exec(`
    DELETE FROM events; DELETE FROM notes; DELETE FROM applications;
    DELETE FROM candidates; DELETE FROM jobs; DELETE FROM companies;
    DELETE FROM sqlite_sequence;
  `);
  for (const f of fs.readdirSync(UPLOAD_DIR)) fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
}

export function seedIfEmpty() {
  if (process.env.SEED === 'false') return;
  if (db.prepare('SELECT COUNT(*) AS n FROM companies').get().n === 0) {
    seed();
    console.log('Seeded demo data');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) reset();
  seedIfEmpty();
}
