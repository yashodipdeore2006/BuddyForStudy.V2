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
};

// Keep domain packs declarative: a new niche can be added as another pack entry.
export const buildWithAiQuestionPacks: QuestionPack[] = [
  {
    id: "programming_web",
    match: /python|javascript|java|programming|web development|react|node|backend|frontend|full.?stack|mobile app/i,
    questions: [
      { id: "buildTarget", type: "single", text: "What do you want to create with this skill?", options: ["Website or web app", "Backend or API", "Mobile app", "Automation or scripts", "Data analysis or AI"], optional: true, why: "The end product determines which frameworks, tools and projects come first.", changes: ["skills", "projects"] },
      { id: "includeDsa", type: "single", text: "Should this path include interview-style DSA practice?", options: ["Yes, include DSA", "No, focus on building", "A little of both"], optional: true, why: "This controls whether problem-solving and interview practice are included.", changes: ["skills", "assessment"] }
    ]
  },
  {
    id: "ai_data",
    match: /data analytics|data science|machine learning|artificial intelligence|power bi|sql/i,
    questions: [
      { id: "targetRole", type: "single", text: "Which outcome best matches your goal?", options: ["Data analyst", "Data scientist", "ML engineer", "AI app builder", "Business intelligence analyst"], optional: true, why: "The target role changes tool sequence and project depth.", changes: ["skills", "projects"] },
      { id: "mathComfort", type: "single", text: "How comfortable are you with mathematics?", options: ["No maths background", "School-level maths", "College-level maths", "Comfortable with statistics"], optional: true, why: "This sets the prerequisite pace for statistics and model concepts.", changes: ["depth", "schedule"] }
    ]
  },
  {
    id: "digital_marketing",
    match: /digital marketing|seo|marketing|social media|advertising/i,
    questions: [
      { id: "marketingChannel", type: "single", text: "Which channel should the course focus on?", options: ["SEO", "Social media", "Paid ads", "Email marketing", "A balanced mix"], optional: true, why: "This selects channel-specific tools, metrics and campaign exercises.", changes: ["skills", "resources"] }
    ]
  },
  {
    id: "design_media",
    match: /figma|design|photography|video editing|premiere|davinci/i,
    questions: [
      { id: "creativeTool", type: "single", text: "Which tool or device will you use?", options: ["Figma", "Photoshop", "Premiere Pro", "DaVinci Resolve", "Phone or camera"], optional: true, why: "Resources will match the software or device you actually use.", changes: ["resources", "projects"] }
    ]
  },
  {
    id: "cloud_security",
    match: /cloud|aws|azure|security|network|certification|ccna|comptia/i,
    questions: [
      { id: "labAccess", type: "single", text: "Do you have access to a practice lab or free cloud tier?", options: ["Yes, I have one", "I can use free-tier tools", "No, use browser-based labs"], optional: true, why: "This keeps hands-on exercises within tools you can access.", changes: ["resources", "projects"] }
    ]
  },
  {
    id: "language_learning",
    match: /english|spanish|french|german|language|ielts|toefl/i,
    questions: [
      { id: "languageGoal", type: "single", text: "Which skill matters most?", options: ["Speaking", "Listening", "Reading", "Writing", "Test preparation"], optional: true, why: "This sets the balance of practice activities and assessments.", changes: ["skills", "assessment"] }
    ]
  },

  {
    id: "office_skills",
    match: /excel|power bi|project management|office skills|spreadsheet/i,
    questions: [
      { id: "officeToolVersion", type: "single", text: "Which tool or version do you use?", options: ["Microsoft Excel", "Google Sheets", "Power BI", "Tableau", "Pick for me"], optional: true, why: "The exact tool changes the interface, formulas and practice files.", changes: ["resources", "projects"] },
      { id: "officeTask", type: "single", text: "Which task do you most want to improve?", options: ["Reports and dashboards", "Data cleaning", "Formulas and automation", "Project planning", "Pick for me"], optional: true, why: "Task-based lessons are more useful than a generic feature tour.", changes: ["skills", "projects"] }
    ]
  },
  {
    id: "music_art",
    match: /music|guitar|piano|drawing|painting|illustration|singing/i,
    questions: [
      { id: "creativeMedium", type: "single", text: "Which instrument or medium will you practice with?", options: ["Guitar", "Piano or keyboard", "Voice", "Drawing or painting", "Digital art", "Pick for me"], optional: true, why: "This selects practice exercises and resources for your medium.", changes: ["resources", "projects"] }
    ]
  },
  {
    id: "personal_finance",
    match: /personal finance|budgeting|investing|financial literacy/i,
    questions: [
      { id: "financeGoal", type: "single", text: "What is your learning goal?", options: ["Budgeting and saving", "Understand long-term investing", "Understand markets and risk", "Personal finance basics", "Pick for me"], optional: true, why: "This selects educational topics and examples; the course is for learning, not personal financial advice.", changes: ["skills", "resources"] }
    ]
  },
  {
    id: "fitness_wellness",
    match: /fitness|exercise|workout|yoga|mobility/i,
    questions: [
      { id: "practiceSetup", type: "single", text: "What practice setup do you have?", options: ["No equipment", "Home basics", "Gym access", "Yoga mat or open space", "Pick for me"], optional: true, why: "This keeps demonstrations matched to the equipment and space available. Educational content only; seek qualified guidance when needed.", changes: ["resources", "projects"] }
    ]
  }
];


export const buildWithAiPurposePacks: Record<string, BuildWithAiQuestion[]> = {
  career: [
    { id: "careerStage", type: "single", text: "Where are you in your career journey?", options: ["Student", "Fresher", "Experienced professional", "Switching careers"], optional: true, when: "purpose=career", why: "This sets the starting point and avoids repeating skills you already use.", changes: ["skills", "depth"] },
    { id: "portfolioStatus", type: "single", text: "What best describes your project portfolio?", options: ["I have no portfolio yet", "I have practice projects", "I have deployed projects", "I have professional experience"], optional: true, when: "purpose=career", why: "Portfolio status determines which practical deliverables are most useful.", changes: ["projects"] }
  ],
  freelance: [
    { id: "freelanceService", type: "single", text: "Which service do you want to offer to clients?", options: ["Web or app development", "Design", "Data and automation", "Marketing", "Writing or content", "Not sure yet"], optional: true, when: "purpose=freelance", why: "This focuses the roadmap on a sellable service and relevant portfolio work.", changes: ["skills", "projects"] },
    { id: "clientType", type: "single", text: "Who would you prefer to work with?", options: ["Individuals", "Startups", "Small businesses", "Larger companies", "Not sure yet"], optional: true, when: "purpose=freelance", why: "Client type changes project scope, communication and delivery examples.", changes: ["projects"] }
  ],
  career_switch: [
    { id: "switchExperience", type: "single", text: "What experience can you build on?", options: ["Student or recent graduate", "Some professional experience", "Experienced in another field", "Returning to work"], optional: true, when: "purpose=career_switch", why: "Transferable experience helps avoid starting from zero unnecessarily.", changes: ["skills", "depth"] },
    { id: "switchTarget", type: "text", text: "Which role or field do you want to move into?", optional: true, when: "purpose=career_switch", why: "A clear destination makes the transition roadmap more specific.", changes: ["skills", "projects"] }
  ],
  exam: [
    { id: "examPreparationStyle", type: "single", text: "How should exam preparation be balanced?", options: ["Concepts first", "Practice questions first", "Mock tests and revision", "Balanced preparation"], optional: true, when: "purpose=exam", why: "This changes the balance between explanations, drills and timed practice.", changes: ["assessment", "resources"] }
  ],
  project: [
    { id: "projectAudience", type: "single", text: "Who is this project for?", options: ["Personal portfolio", "College or academic submission", "A real client or business", "A startup or product idea"], optional: true, when: "purpose=project", why: "Audience determines scope, quality bar and delivery requirements.", changes: ["projects", "assessment"] }
  ],
  hobby: [
    { id: "learningMotivation", type: "single", text: "What would make this learning experience successful?", options: ["Enjoy the process", "Create something personal", "Build a consistent habit", "Reach an intermediate level"], optional: true, when: "purpose=hobby", why: "This sets a sustainable pace and a meaningful outcome.", changes: ["schedule", "projects"] }
  ]
};

export function getPurposeQuestions(purpose: string): BuildWithAiQuestion[] {
  return buildWithAiPurposePacks[purpose] || [];
}

export function getSkillChecklist(topic: string): string[] {
  const normalized = String(topic || "").toLowerCase();
  if (/python/.test(normalized)) return ["Python syntax and variables", "Conditions and loops", "Functions", "Lists, tuples and dictionaries", "Object-oriented programming", "Files and exceptions", "Modules and packages"];
  if (/javascript|mern|react|node|web development/.test(normalized)) return ["HTML and CSS", "JavaScript fundamentals", "DOM and browser APIs", "React or frontend", "Node.js and APIs", "Databases", "Git and GitHub"];
  if (/data analytics|data science|machine learning|artificial intelligence|power bi|sql/.test(normalized)) return ["Spreadsheets and formulas", "SQL queries", "Statistics basics", "Python for data", "Data visualization", "Power BI or Tableau", "Machine learning basics"];
  if (/digital marketing|seo|marketing|social media|advertising/.test(normalized)) return ["Marketing fundamentals", "SEO basics", "Social media management", "Paid advertising", "Email campaigns", "Analytics and reporting", "Content strategy"];
  if (/figma|design|photography|video editing|premiere|davinci/.test(normalized)) return ["Design fundamentals", "Figma or design tools", "Typography and layout", "Image editing", "Video editing", "Color and composition", "Portfolio workflow"];
  if (/cloud|aws|azure|security|network|ccna|comptia/.test(normalized)) return ["Networking fundamentals", "Linux or command line", "Cloud basics", "Identity and access", "Security fundamentals", "Virtual machines or labs", "Monitoring and troubleshooting"];
  if (/english|spanish|french|german|language|ielts|toefl/.test(normalized)) return ["Basic vocabulary", "Grammar fundamentals", "Reading practice", "Listening practice", "Speaking practice", "Writing practice", "Exam strategies"];
  if (/excel|power bi|project management|office skills|spreadsheet/.test(normalized)) return ["Spreadsheet basics", "Formulas and functions", "Data cleaning", "Pivot tables", "Charts and dashboards", "Automation", "Reporting"];
  if (/music|guitar|piano|drawing|painting|illustration|singing/.test(normalized)) return ["Basic technique", "Foundational theory", "Guided exercises", "Practice routines", "Intermediate techniques", "Creative exercises", "Personal project"];
  return [];
}

export function getNicheQuestions(topic: string): BuildWithAiQuestion[] {
  return buildWithAiQuestionPacks.find((pack) => pack.match.test(String(topic || "")))?.questions || [];
}
