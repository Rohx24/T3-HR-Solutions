// Skills dictionary: canonical name -> aliases (lowercase, matched on word boundaries).
export const SKILLS = {
  // Languages
  Java: ['java', 'j2ee', 'jee', 'core java'],
  Python: ['python', 'python3'],
  JavaScript: ['javascript', 'js', 'es6', 'ecmascript'],
  TypeScript: ['typescript'],
  'C++': ['c++', 'cpp'],
  'C#': ['c#', 'csharp'],
  Go: ['golang', 'go lang'],
  Kotlin: ['kotlin'],
  Swift: ['swift'],
  Ruby: ['ruby'],
  PHP: ['php'],
  Rust: ['rust'],
  Scala: ['scala'],
  Dart: ['dart'],

  // Frontend
  React: ['react', 'reactjs', 'react.js'],
  Angular: ['angular', 'angularjs'],
  Vue: ['vue', 'vue.js', 'vuejs'],
  'Next.js': ['next.js', 'nextjs'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3', 'scss', 'sass'],
  'Tailwind CSS': ['tailwind', 'tailwindcss', 'tailwind css'],
  Redux: ['redux'],
  Bootstrap: ['bootstrap'],

  // Backend
  'Node.js': ['node', 'node.js', 'nodejs'],
  'Express.js': ['express.js', 'expressjs', 'express js'],
  'Spring Boot': ['spring boot', 'springboot'],
  Spring: ['spring mvc', 'spring framework', 'spring security', 'spring cloud'],
  Hibernate: ['hibernate', 'jpa'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi', 'fast api'],
  '.NET': ['.net', 'dotnet', 'asp.net'],
  Laravel: ['laravel'],
  'Ruby on Rails': ['ruby on rails', 'rails'],
  GraphQL: ['graphql'],
  'REST API': ['rest api', 'rest apis', 'restful', 'rest services', 'restful apis'],
  Microservices: ['microservices', 'microservice', 'micro-services'],
  Kafka: ['kafka', 'apache kafka'],
  RabbitMQ: ['rabbitmq'],
  Maven: ['maven'],
  Gradle: ['gradle'],
  JUnit: ['junit', 'mockito'],
  Celery: ['celery'],

  // Databases
  SQL: ['sql'],
  MySQL: ['mysql'],
  PostgreSQL: ['postgresql', 'postgres'],
  MongoDB: ['mongodb', 'mongo'],
  Redis: ['redis'],
  Oracle: ['oracle', 'pl/sql', 'plsql'],
  Elasticsearch: ['elasticsearch', 'elastic search'],
  DynamoDB: ['dynamodb'],
  Firebase: ['firebase'],

  // Cloud / DevOps
  AWS: ['aws', 'amazon web services', 'ec2', 's3'],
  Azure: ['azure'],
  GCP: ['gcp', 'google cloud'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s', 'eks'],
  Terraform: ['terraform'],
  Jenkins: ['jenkins'],
  'CI/CD': ['ci/cd', 'cicd', 'ci cd'],
  'GitHub Actions': ['github actions'],
  Git: ['git', 'github', 'gitlab', 'bitbucket'],
  Linux: ['linux', 'unix', 'bash', 'shell scripting'],
  Ansible: ['ansible'],
  Nginx: ['nginx'],

  // Data / ML
  'Machine Learning': ['machine learning', 'ml'],
  'Deep Learning': ['deep learning'],
  TensorFlow: ['tensorflow', 'keras'],
  PyTorch: ['pytorch'],
  'scikit-learn': ['scikit-learn', 'sklearn', 'scikit learn'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  NLP: ['nlp', 'natural language processing'],
  LLM: ['llm', 'llms', 'large language models', 'generative ai', 'genai'],
  'Data Analysis': ['data analysis', 'data analytics'],
  'Power BI': ['power bi', 'powerbi'],
  Tableau: ['tableau'],
  Spark: ['spark', 'pyspark', 'apache spark'],
  Airflow: ['airflow'],

  // Mobile
  Android: ['android'],
  iOS: ['ios'],
  Flutter: ['flutter'],
  'React Native': ['react native'],

  // QA
  Selenium: ['selenium'],
  Cypress: ['cypress'],
  Jest: ['jest'],
  Pytest: ['pytest'],
  'Manual Testing': ['manual testing'],
  'Automation Testing': ['automation testing', 'test automation'],
  Postman: ['postman'],
  JMeter: ['jmeter'],

  // Practices / tools
  Agile: ['agile', 'scrum'],
  Jira: ['jira'],
  Figma: ['figma'],
};

export const STAGES = ['Applied', 'Screening', 'Technical', 'HR Round', 'Offer', 'Hired', 'Rejected'];

// Role profiles: skill -> weight. Highest total wins.
const ROLE_WEIGHTS = {
  'Java Developer': { Java: 3, 'Spring Boot': 3, Spring: 2, Hibernate: 2, Maven: 1, Gradle: 1, JUnit: 1, Microservices: 1, Kafka: 1 },
  'Python Developer': { Python: 3, Django: 3, Flask: 3, FastAPI: 3, Celery: 1, Pytest: 1 },
  'Frontend Developer': { React: 3, Angular: 3, Vue: 3, 'Next.js': 2, JavaScript: 2, TypeScript: 2, HTML: 1, CSS: 1, Redux: 1, 'Tailwind CSS': 1, Figma: 1 },
  'Full Stack Developer': { 'Node.js': 3, 'Express.js': 3, MongoDB: 1, GraphQL: 1 },
  'Data Scientist': { 'Machine Learning': 3, 'Deep Learning': 3, TensorFlow: 3, PyTorch: 3, 'scikit-learn': 3, Pandas: 2, NumPy: 2, NLP: 2, LLM: 2, 'Data Analysis': 1, Spark: 1, Tableau: 1, 'Power BI': 1 },
  'DevOps Engineer': { Docker: 2, Kubernetes: 3, Terraform: 3, Jenkins: 2, 'CI/CD': 2, Ansible: 3, 'GitHub Actions': 2, AWS: 1, Azure: 1, GCP: 1, Linux: 1, Nginx: 1 },
  'Mobile Developer': { Android: 3, iOS: 3, Swift: 3, Kotlin: 2, Flutter: 3, 'React Native': 3, Dart: 2 },
  'QA Engineer': { Selenium: 3, Cypress: 3, 'Manual Testing': 3, 'Automation Testing': 3, JMeter: 2, Postman: 1, Pytest: 1, Jest: 1 },
};

// Explicit job titles near the top of a resume are a strong signal.
const TITLE_HINTS = {
  'Java Developer': /\bjava\s+(developer|engineer)\b/,
  'Python Developer': /\bpython\s+(developer|engineer)\b/,
  'Frontend Developer': /\bfront[\s-]?end\b/,
  'Full Stack Developer': /\bfull[\s-]?stack\b/,
  'Data Scientist': /\bdata\s+scien|\b(ml|machine learning)\s+engineer\b/,
  'DevOps Engineer': /\bdevops\b|\bsite reliability\b|\bcloud engineer\b/,
  'Mobile Developer': /\b(android|ios|mobile)\s+(developer|engineer)\b/,
  'QA Engineer': /\bqa\b|\bquality assurance\b|\btest engineer\b|\bsdet\b/,
};

export const DEFAULT_ROLE = 'Software Engineer';
export const ROLES = [...Object.keys(ROLE_WEIGHTS), DEFAULT_ROLE];

const FRONTEND_FRAMEWORKS = ['React', 'Angular', 'Vue', 'Next.js'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Custom boundaries so "c++", "c#", ".net" and "node.js" work, and "java" doesn't match "javascript".
const MATCHERS = Object.entries(SKILLS).map(([skill, aliases]) => ({
  skill,
  re: new RegExp(`(?<![a-z0-9+#])(?:${aliases.map(escapeRegex).join('|')})(?![a-z0-9+#])`, 'i'),
}));

// Knowing a framework implies the base language/skill (so a "SQL" requirement matches a MySQL resume).
const IMPLIES = {
  MySQL: ['SQL'], PostgreSQL: ['SQL'], Oracle: ['SQL'],
  'Spring Boot': ['Java'], Hibernate: ['Java'],
  Django: ['Python'], Flask: ['Python'], FastAPI: ['Python'],
  'Express.js': ['Node.js'],
  React: ['JavaScript'], Angular: ['JavaScript'], Vue: ['JavaScript'], 'Next.js': ['React', 'JavaScript'], TypeScript: ['JavaScript'],
};

export function extractSkills(text) {
  const found = MATCHERS.filter(({ re }) => re.test(text)).map(({ skill }) => skill);
  return [...new Set([...found, ...found.flatMap((s) => IMPLIES[s] ?? [])])];
}

// Map free-text skill input (e.g. "springboot", "react.js") to its canonical name.
export function normalizeSkill(input) {
  const s = String(input).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  for (const [skill, aliases] of Object.entries(SKILLS)) {
    if (skill.toLowerCase() === lower || aliases.includes(lower)) return skill;
  }
  return s;
}

export function normalizeSkills(list) {
  const items = Array.isArray(list) ? list : String(list ?? '').split(',');
  return [...new Set(items.map(normalizeSkill).filter(Boolean))];
}

export function detectRole(skills, text = '') {
  const head = text.slice(0, 600).toLowerCase();
  const scores = Object.fromEntries(
    Object.entries(ROLE_WEIGHTS).map(([role, weights]) => [
      role,
      skills.reduce((sum, s) => sum + (weights[s] ?? 0), 0) + (TITLE_HINTS[role].test(head) ? 5 : 0),
    ]),
  );

  // Frontend framework + a real backend profile => full stack.
  const backend = Math.max(scores['Java Developer'], scores['Python Developer'], scores['Full Stack Developer']);
  if (skills.some((s) => FRONTEND_FRAMEWORKS.includes(s)) && backend >= 5 && scores['Frontend Developer'] >= 5) {
    scores['Full Stack Developer'] += Math.max(scores['Frontend Developer'], backend);
  }

  const [role, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return score > 0 ? role : DEFAULT_ROLE;
}
