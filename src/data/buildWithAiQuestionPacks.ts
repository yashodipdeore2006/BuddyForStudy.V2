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
    match: /data analytics|data science|machine learning|artificial intelligence|power bi|excel|sql/i,
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

export function getNicheQuestions(topic: string): BuildWithAiQuestion[] {
  return buildWithAiQuestionPacks.find((pack) => pack.match.test(String(topic || "")))?.questions || [];
}
