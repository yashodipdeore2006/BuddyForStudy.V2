export type BuildWithAiQuestion = {
  id: string;
  type: "single" | "multi" | "text" | "paste" | "checklist" | "time";
  text: string;
  options?: string[];
  allowText?: boolean;
  optional: boolean;
  when?: string;
  why?: string;
  changes?: string[];
};

type QuestionPack = {
  id: string;
  match: RegExp;
  questions: BuildWithAiQuestion[];
  disclaimer?: string;
};

// Keep domain packs declarative: a new niche can be added as another pack entry.
export const buildWithAiQuestionPacks: QuestionPack[] = [
  {
    id: "programming_web",
    match: /javascript|java|programming|web development|react|node|backend|frontend|full.?stack|mobile app|python|golang|c\+\+/i,
    questions: [
      { id: "buildTarget", type: "single", text: "What do you want to build primarily?", options: ["Modern website or web app", "Mobile app (iOS / Android)", "Backend API and database", "Automation scripts", "Game or interactive experience", "Not sure, pick for me"], optional: true, why: "The end product determines the stack, frameworks and final capstone project.", changes: ["skills", "projects"] },
      { id: "dsaNeeded", type: "single", text: "Do you need algorithmic DSA practice?", options: ["Yes, preparing for tech interviews", "No, focus on practical building skills", "A little of both", "Not sure, pick for me"], optional: true, why: "This separates interview preparation from project-focused learning.", changes: ["DSA inclusion", "theory vs practice"] }
    ]
  },
  {
    id: "ai_data",
    match: /\bai\b|llm|nlp|chatgpt|deep learning|data analytics|data science|machine learning|power bi|sql|statistics/i,
    questions: [
      { id: "aiRole", type: "single", text: "Which specific role or outcome fits your goal?", options: ["Data Analyst", "Data Scientist", "ML Engineer", "AI App Builder (LLMs / APIs)", "Business Intelligence Analyst", "Not sure, pick for me"], optional: true, why: "The role determines the tool sequence, mathematical depth and project choices.", changes: ["math level", "tools", "projects"] },
      { id: "mathComfort", type: "single", text: "How comfortable are you with mathematics and statistics?", options: ["Beginner — avoid heavy maths", "High-school algebra level", "College calculus and linear algebra", "Comfortable with statistics", "Not sure, pick for me"], optional: true, why: "This adjusts prerequisites and mathematical depth without blocking practical learning.", changes: ["prerequisites", "depth"] }
    ]
  },
  {
    id: "marketing",
    match: /digital marketing|seo|social media|advertising|paid ads|copywriting|growth marketing|email marketing/i,
    questions: [
      { id: "marketingChannel", type: "single", text: "Which primary channel do you want to master first?", options: ["SEO and organic search", "Paid ads (Meta / Google)", "Social media and content", "Email and automation", "All-round strategy"], optional: true, why: "This focuses the first modules on the channels, tools and metrics you want to learn.", changes: ["channel modules", "case studies"] }
    ]
  },
  {
    id: "personal_finance",
    match: /finance|investing|stock market|trading|crypto|budgeting|real estate|mutual funds|financial literacy/i,
    disclaimer: "Educational content only. This course is not financial advice and does not recommend specific investments.",
    questions: [
      { id: "marketRegion", type: "single", text: "Which market or region do you want to understand?", options: ["US stock market", "India (NSE / BSE)", "Global markets / crypto", "Europe / UK market", "Not sure, pick for me"], optional: true, why: "Market context changes the examples, terminology and regulatory topics covered.", changes: ["market context", "examples"] },
      { id: "investingStyle", type: "single", text: "What is your investment learning focus?", options: ["Long-term wealth building (index funds / ETFs)", "Active swing-trading concepts", "Budgeting and debt payoff", "Understand markets and risk", "Not sure, pick for me"], optional: true, why: "This sets the educational emphasis without providing personal investment recommendations.", changes: ["safety framing", "strategy"] }
    ]
  },
  {
    id: "design_media",
    match: /figma|ui.?ux|design|photoshop|illustrator|premiere|video editing|davinci|photography|animation|blender/i,
    questions: [
      { id: "primaryTool", type: "single", text: "Which software or tool will you use?", options: ["Figma (UI / UX)", "Adobe Photoshop / Illustrator", "Premiere Pro / DaVinci Resolve", "Smartphone / DSLR camera", "Not sure, pick for me"], optional: true, why: "This ensures software-specific tutorials, workflows and practice assets.", changes: ["software tutorials", "practice assets"] }
    ]
  },
  {
    id: "music_art",
    match: /music|guitar|piano|singing|music production|ableton|fl studio|drawing|painting|illustration/i,
    questions: [
      { id: "instrumentOwned", type: "single", text: "What equipment or instrument do you currently have?", options: ["Acoustic / electric guitar", "Piano / keyboard", "DAW software (Ableton / FL Studio)", "Voice only / beginner", "Not sure, pick for me"], optional: true, why: "This customizes guided exercises and practice routines to the equipment you currently have.", changes: ["practice routine", "resource selection"] }
    ]
  },
  {
    id: "language_learning",
    match: /english|spanish|french|german|japanese|mandarin|korean|language|ielts|toefl|jlpt/i,
    questions: [
      { id: "langGoal", type: "single", text: "What is your primary goal for learning?", options: ["Conversational fluency", "Work / business professional", "Travel and culture", "Exam preparation (IELTS / TOEFL / JLPT)", "Not sure, pick for me"], optional: true, why: "This shifts the balance between grammar, listening, speaking and exam practice.", changes: ["skill mix", "vocabulary focus"] }
    ]
  },
  {
    id: "cloud_it",
    match: /aws|azure|google cloud|gcp|docker|kubernetes|cybersecurity|devops|linux|ccna|cloud computing|network security|comptia/i,
    questions: [
      { id: "cloudVendor", type: "single", text: "Which cloud provider or vendor standard should the course focus on?", options: ["AWS (Amazon Web Services)", "Microsoft Azure", "Google Cloud Platform (GCP)", "Linux and DevOps general", "Not sure, pick for me"], optional: true, why: "The selected ecosystem determines console walkthroughs, labs and certification objectives.", changes: ["lab tasks", "exam objective map"] },
      { id: "labAccess", type: "single", text: "What practice environment can you access?", options: ["I already have a lab or cloud account", "I can use free-tier tools", "Use browser-based labs only"], optional: true, why: "This keeps hands-on exercises within tools you can access.", changes: ["resources", "projects"] }
    ]
  },
  {
    id: "academics",
    match: /sat|act|gre|gmat|jee|neet|upsc|gate|cat|calculus|physics|chemistry|biology|entrance exam|school exam|college exam/i,
    questions: [
      { id: "targetExamName", type: "text", text: "Which exam, board or syllabus are you targeting?", options: ["SAT / ACT", "GRE / GMAT", "JEE / GATE", "NEET", "UPSC / CAT", "College or school exam"], optional: true, allowText: true, why: "The exact exam or syllabus helps map topics, practice questions and revision milestones.", changes: ["chapter-wise path", "previous-year questions"] }
    ]
  },
  {
    id: "office_skills",
    match: /excel|google sheets|power bi|vba|notion|project management|agile|jira|tableau|spreadsheet/i,
    questions: [
      { id: "officeToolVersion", type: "single", text: "Which tool or version do you use?", options: ["Microsoft Excel", "Google Sheets", "Power BI", "Tableau", "Not sure, pick for me"], optional: true, why: "The exact tool changes the interface, formulas and practice files.", changes: ["resources", "projects"] },
      { id: "officeTask", type: "single", text: "Which task do you want to get better at immediately?", options: ["Automating repetitive tasks", "Building dashboards and reports", "Managing team workflows", "Advanced formulas and pivot tables", "Not sure, pick for me"], optional: true, why: "Task-based lessons are more useful than a generic feature tour.", changes: ["task-based path", "templates"] }
    ]
  },
  {
    id: "fitness_wellness",
    match: /fitness|exercise|workout|weight loss|gym|calisthenics|yoga|mobility|running|muscle building|diet/i,
    disclaimer: "Educational content only. Consult a qualified health professional before starting an intense exercise or diet program.",
    questions: [
      { id: "fitnessEquipment", type: "single", text: "What space and equipment can you access?", options: ["Full commercial gym", "Home dumbbells and resistance bands", "Bodyweight / minimal space", "Outdoor running / park", "Not sure, pick for me"], optional: true, why: "This filters demonstrations and practice routines to match your available equipment and space.", changes: ["routine style", "exercise selection"] }
    ]
  }
];

export const buildWithAiPurposePacks: Record<string, BuildWithAiQuestion[]> = {
  career: [
    { id: "targetRole", type: "single", text: "What is your target role and company type?", options: ["Entry-level (Tech Startup)", "Mid / Senior (Enterprise)", "MNC / Big Tech", "Remote global job"], allowText: true, optional: true, when: "purpose=career", why: "This aligns portfolio projects, interview preparation and the expected hiring context.", changes: ["interview module", "DSA / aptitude priority"] },
    { id: "jobTimeline", type: "single", text: "Do you have an upcoming interview or target date?", options: ["Within 1 month (crash course)", "1–3 months", "3–6 months", "No strict deadline"], optional: true, when: "purpose=career", why: "This controls schedule density and when mock interviews are introduced.", changes: ["pacing", "schedule"] },
    { id: "portfolioStatus", type: "single", text: "What best describes your project portfolio?", options: ["I have no portfolio yet", "I have practice projects", "I have deployed projects", "I have professional experience"], optional: true, when: "purpose=career", why: "Portfolio status determines which practical deliverables are most useful.", changes: ["projects"] }
  ],
  freelance: [
    { id: "clientAcquisition", type: "single", text: "Where do you plan to acquire clients?", options: ["Marketplaces (Upwork / Fiverr)", "Direct outreach / cold email", "Local businesses", "Personal brand / social media"], optional: true, when: "purpose=freelance", why: "This tailors lessons around platform optimization, outreach and client proposals.", changes: ["client skills", "proposal templates"] },
    { id: "freelancePortfolio", type: "single", text: "Do you already have showcase projects?", options: ["No, need to build from scratch", "Have basic ones, need polishing", "Yes, need specialized case studies"], optional: true, when: "purpose=freelance", why: "This determines the portfolio milestones and case-study depth.", changes: ["portfolio milestones", "project weight"] },
    { id: "freelanceService", type: "single", text: "Which service do you want to offer to clients?", options: ["Web or app development", "Design", "Data and automation", "Marketing", "Writing or content", "Not sure yet"], optional: true, when: "purpose=freelance", why: "This focuses the roadmap on a sellable service and relevant portfolio work.", changes: ["skills", "projects"] }
  ],
  career_switch: [
    { id: "switchExperience", type: "single", text: "What experience can you build on?", options: ["Student or recent graduate", "Some professional experience", "Experienced in another field", "Returning to work"], optional: true, when: "purpose=career_switch", why: "Transferable experience helps avoid starting from zero unnecessarily.", changes: ["skills", "depth"] },
    { id: "switchTarget", type: "text", text: "Which role or field do you want to move into?", optional: true, when: "purpose=career_switch", why: "A clear destination makes the transition roadmap more specific.", changes: ["skills", "projects"] }
  ],
  exam: [
    { id: "examPreparationType", type: "single", text: "What is the status of your preparation?", options: ["First attempt (full syllabus)", "Retake / revision only", "Mock test and practice focused"], optional: true, when: "purpose=exam", why: "This determines whether the path covers full theory or prioritizes revision and practice papers.", changes: ["syllabus mapping", "revision blocks"] },
    { id: "examTimeline", type: "single", text: "When is your target exam date?", options: ["Less than 30 days", "1 to 3 months", "6+ months away"], optional: true, when: "purpose=exam", why: "This controls the revision schedule and mock-test frequency.", changes: ["backward schedule", "mock frequency"] }
  ],
  project: [
    { id: "projectAudience", type: "single", text: "Who is this project for?", options: ["Personal portfolio", "College or academic submission", "A real client or business", "A startup or product idea"], optional: true, when: "purpose=project", why: "Audience determines scope, quality bar and delivery requirements.", changes: ["projects", "assessment"] }
  ],
  hobby: [
    { id: "hobbyFocus", type: "single", text: "Which aspect excites you the most?", options: ["Fun projects fast", "Deep master-class theory", "Creative experimentation", "Relaxed casual pace"], optional: true, when: "purpose=hobby", why: "This keeps learning enjoyable without adding unnecessary academic pressure.", changes: ["resource style", "practice rigor"] }
  ]
};

export function getPurposeQuestions(purpose: string): BuildWithAiQuestion[] {
  return buildWithAiPurposePacks[purpose] || [];
}

export function getSkillChecklist(topic: string): string[] {
  const normalized = String(topic || "").toLowerCase();
  if (/python/.test(normalized)) return ["Python syntax and variables", "Conditions and loops", "Functions", "Lists, tuples and dictionaries", "Object-oriented programming", "Files and exceptions", "Modules and packages"];
  if (/javascript|mern|react|node|web development|java|programming|full.?stack/.test(normalized)) return ["HTML and CSS", "Programming fundamentals", "Language syntax and control flow", "Functions and data structures", "Frameworks and libraries", "APIs and databases", "Git and GitHub"];
  if (/ai|llm|nlp|data analytics|data science|machine learning|artificial intelligence|power bi|sql|statistics/.test(normalized)) return ["Spreadsheets and formulas", "SQL queries", "Statistics basics", "Python for data", "Data visualization", "Power BI or Tableau", "Machine learning basics"];
  if (/digital marketing|seo|marketing|social media|advertising|copywriting/.test(normalized)) return ["Marketing fundamentals", "SEO basics", "Social media management", "Paid advertising", "Email campaigns", "Analytics and reporting", "Content strategy"];
  if (/figma|ui.?ux|design|photography|video editing|premiere|davinci|photoshop|illustrator|blender/.test(normalized)) return ["Design fundamentals", "Figma or design tools", "Typography and layout", "Image editing", "Video editing", "Color and composition", "Portfolio workflow"];
  if (/cloud|aws|azure|gcp|security|network|ccna|comptia|devops|kubernetes|linux/.test(normalized)) return ["Networking fundamentals", "Linux or command line", "Cloud basics", "Identity and access", "Security fundamentals", "Virtual machines or labs", "Monitoring and troubleshooting"];
  if (/english|spanish|french|german|japanese|korean|language|ielts|toefl|jlpt/.test(normalized)) return ["Basic vocabulary", "Grammar fundamentals", "Reading practice", "Listening practice", "Speaking practice", "Writing practice", "Exam strategies"];
  if (/excel|google sheets|power bi|project management|office skills|spreadsheet|jira|tableau/.test(normalized)) return ["Spreadsheet basics", "Formulas and functions", "Data cleaning", "Pivot tables", "Charts and dashboards", "Automation", "Reporting"];
  if (/music|guitar|piano|drawing|painting|illustration|singing|ableton|fl studio/.test(normalized)) return ["Basic technique", "Foundational theory", "Guided exercises", "Practice routines", "Intermediate techniques", "Creative exercises", "Personal project"];
  if (/sat|act|gre|gmat|jee|neet|upsc|gate|cat|calculus|physics|chemistry|biology|entrance exam/.test(normalized)) return ["Syllabus familiarity", "Core concepts", "Chapter-wise practice", "Previous-year questions", "Timed tests", "Mock-test review", "Revision strategy"];
  return [];
}

export function getNicheQuestions(topic: string): BuildWithAiQuestion[] {
  const matchingPacks = buildWithAiQuestionPacks.filter((pack) => pack.match.test(String(topic || "")));
  const seenQuestionIds = new Set<string>();
  return matchingPacks.flatMap((pack) => pack.questions).filter((question) => {
    if (seenQuestionIds.has(question.id)) return false;
    seenQuestionIds.add(question.id);
    return true;
  });
}

export function getNicheDisclaimer(topic: string): string | undefined {
  const disclaimers = [...new Set(
    buildWithAiQuestionPacks
      .filter((pack) => pack.match.test(String(topic || "")))
      .map((pack) => pack.disclaimer)
      .filter((disclaimer): disclaimer is string => Boolean(disclaimer))
  )];
  return disclaimers.length ? disclaimers.join(" ") : undefined;
}
