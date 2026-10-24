/**
 * Phase 0-only deterministic provider fixtures. These values are synthetic and
 * are consumed only by automated tests; they do not represent real YouTube resources.
 */
export const mockMernYouTubeVideos = [
  {
    id: "phase0-mern-001",
    channelId: "phase0-channel-001",
    channelTitle: "Mock Channel One",
    title: "MERN Stack Full Course: Build a Complete Task Manager",
    description: "MERN stack full course. What you will learn: MongoDB data modeling, Express.js REST APIs, React components and state, Node.js asynchronous code, authentication, testing and deployment. Course content and curriculum with hands-on project work. Chapters and learning objectives included.",
    duration: "PT5H30M",
    views: 850000,
    likes: 42000,
    subscribers: 620000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN stack", "MongoDB", "Express", "React", "Node.js", "full course"]
  },
  {
    id: "phase0-mern-002",
    channelId: "phase0-channel-002",
    channelTitle: "Mock Channel Two",
    title: "MERN Stack Project Tutorial for Beginners",
    description: "Build a MERN stack application from scratch. Topics covered: JavaScript, Node.js, Express middleware, MongoDB and Mongoose, React hooks, API integration, authorization, debugging, tests and production deployment. Includes a practical capstone project and source code workflow.",
    duration: "PT4H45M",
    views: 420000,
    likes: 26000,
    subscribers: 340000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN", "beginner", "React", "Express", "MongoDB", "Node"]
  },
  {
    id: "phase0-mern-003",
    channelId: "phase0-channel-003",
    channelTitle: "Mock Channel Three",
    title: "Complete MERN Stack Bootcamp Course",
    description: "Complete course covering the MERN stack. Curriculum: Node.js runtime and modules, Express routing and REST API design, MongoDB schemas, React state and components, authentication, security, integration testing, Git workflow and deployment. Hands-on exercises and project-based learning.",
    duration: "PT6H10M",
    views: 190000,
    likes: 15000,
    subscribers: 180000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN stack", "bootcamp", "full course", "project"]
  },
  {
    id: "phase0-mern-004",
    channelId: "phase0-channel-004",
    channelTitle: "Mock Channel Four",
    title: "MERN Stack: REST APIs and Full Stack Development",
    description: "A long-form MERN full course with Express REST APIs, Node.js asynchronous programming, MongoDB persistence, Mongoose validation, React routing, form state, authentication, automated tests and deployment. Full project walkthrough with chapter outline and course objectives.",
    duration: "PT4H05M",
    views: 98000,
    likes: 8100,
    subscribers: 92000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN", "REST API", "Express", "Mongoose", "React"]
  },
  {
    id: "phase0-mern-005",
    channelId: "phase0-channel-005",
    channelTitle: "Mock Channel Five",
    title: "MERN Stack Full Course with Authentication and Testing",
    description: "Learn to build and test a full-stack MERN app: MongoDB modeling, Node.js, Express middleware, React hooks, REST integration, authentication, authorization, security, debugging and production deployment. Includes exercises, a test plan and a capstone project.",
    duration: "PT7H20M",
    views: 310000,
    likes: 22000,
    subscribers: 255000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN stack", "authentication", "testing", "full course"]
  },
  {
    id: "phase0-mern-006",
    channelId: "phase0-channel-006",
    channelTitle: "Mock Channel Six",
    title: "MERN Stack Complete Course: React, Express, MongoDB, Node",
    description: "Project-based MERN stack complete course. Learn JavaScript foundations, Node and Express APIs, MongoDB database design, React components and state, client-server integration, authentication, testing and deployment. Course outline, practical labs, exercises and project milestones.",
    duration: "PT5H05M",
    views: 67000,
    likes: 5400,
    subscribers: 54000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["React", "Express", "MongoDB", "Node.js", "MERN"]
  },
  {
    id: "phase0-mern-007",
    channelId: "phase0-channel-007",
    channelTitle: "Mock Channel Seven",
    title: "MERN Stack Beginner to Advanced Full Course",
    description: "Step-by-step MERN stack curriculum with JavaScript, Node.js, Express API architecture, MongoDB and Mongoose, React state management, auth, security, debugging, automated testing, Git and production deployment. Full application build with hands-on practice and learning objectives.",
    duration: "PT4H30M",
    views: 540000,
    likes: 31000,
    subscribers: 480000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN stack", "beginner", "advanced", "tutorial"]
  },
  {
    id: "phase0-mern-008",
    channelId: "phase0-channel-008",
    channelTitle: "Mock Channel Eight",
    title: "MERN Stack Full Course: API, UI, Database and Deploy",
    description: "Build a MERN web application from database to deployment. Covers MongoDB schemas, Express middleware and routes, Node.js modules, React UI and hooks, REST integration, access control, error handling, test automation, deployment and operational debugging. Hands-on course with chapters.",
    duration: "PT6H45M",
    views: 145000,
    likes: 11200,
    subscribers: 130000,
    publishedAt: "2099-01-01T00:00:00.000Z",
    tags: ["MERN", "full stack", "API", "database", "deployment"]
  }
];

export const mockMernSyllabusResponse = {
  topic: "MERN stack",
  aliases: ["MERN full stack development"],
  modules: [
    { name: "JavaScript and Node.js foundations", weight: 1, keyConcepts: ["JavaScript syntax", "Node.js modules", "async programming"], prerequisites: [] },
    { name: "Express.js API design", weight: 1, keyConcepts: ["Express routing", "REST APIs", "middleware"], prerequisites: ["JavaScript and Node.js foundations"] },
    { name: "MongoDB and Mongoose", weight: 1, keyConcepts: ["MongoDB data modeling", "schemas", "validation"], prerequisites: ["JavaScript and Node.js foundations"] },
    { name: "React components and state", weight: 1, keyConcepts: ["React components", "React hooks", "state management"], prerequisites: ["JavaScript and Node.js foundations"] },
    { name: "Client-server integration", weight: 1, keyConcepts: ["API integration", "HTTP requests", "form state"], prerequisites: ["Express.js API design", "React components and state"] },
    { name: "Authentication and authorization", weight: 1, keyConcepts: ["authentication", "authorization", "access control"], prerequisites: ["Express.js API design"] },
    { name: "Testing and debugging", weight: 1, keyConcepts: ["automated tests", "debugging", "error handling"], prerequisites: ["Client-server integration"] },
    { name: "Production deployment", weight: 1, keyConcepts: ["deployment", "Git workflow", "production monitoring"], prerequisites: ["Testing and debugging"] }
  ]
};

export const fixedGeminiRoadmapResponse = {
  title: "MERN Stack Development Roadmap",
  description: "Build practical full-stack web applications with MongoDB, Express.js, React and Node.js.",
  category: "Web Development",
  canonicalTopic: "MERN stack",
  careerOutcome: "Build and deploy a full-stack JavaScript application.",
  learningOutcomes: [
    "Build REST APIs with Express.js and Node.js.",
    "Create interactive interfaces with React.",
    "Model and query application data with MongoDB."
  ],
  skills: [
    {
      id: "javascript-runtime",
      name: "JavaScript and Node.js",
      category: "Foundations",
      importance: 10,
      prerequisites: [],
      topics: ["JavaScript syntax", "Node.js modules", "async programming"],
      courseDuration: { minMinutes: 120, targetMinutes: 180, maxMinutes: 240 },
      searchQueries: ["JavaScript Node.js foundations"],
      practiceProject: "Command-line task tracker",
      projectPlacement: "skill",
      quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 6, passingScore: 70 },
      projectPlan: {
        scenario: "Create a small command-line task tracker.",
        objectives: ["Practice functions and asynchronous code."],
        requirements: ["Use Node.js modules."],
        instructions: "Implement task creation, listing and completion.",
        expectedOutcome: "A working command-line task tracker."
      }
    },
    {
      id: "express-api",
      name: "Express.js APIs",
      category: "Backend",
      importance: 8,
      prerequisites: ["javascript-runtime"],
      topics: ["Express routing", "REST API design", "middleware"],
      courseDuration: { minMinutes: 180, targetMinutes: 240, maxMinutes: 300 },
      searchQueries: ["Express.js REST API course"],
      practiceProject: "Task management REST API",
      projectPlacement: "skill",
      quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 6, passingScore: 70 },
      projectPlan: {
        scenario: "Create a REST API for task management.",
        objectives: ["Implement routes and validation."],
        requirements: ["Use Express middleware."],
        instructions: "Build create, read, update and delete endpoints.",
        expectedOutcome: "A tested REST API."
      }
    },
    {
      id: "react-ui",
      name: "React UI",
      category: "Frontend",
      importance: 8,
      prerequisites: ["javascript-runtime"],
      topics: ["React components", "React hooks", "state management"],
      courseDuration: { minMinutes: 180, targetMinutes: 240, maxMinutes: 300 },
      searchQueries: ["React components hooks state course"],
      practiceProject: "Task manager interface",
      projectPlacement: "skill",
      quizPolicy: { lessonQuestionCount: 4, moduleQuestionCount: 6, passingScore: 70 },
      projectPlan: {
        scenario: "Create the frontend for a task manager.",
        objectives: ["Build interactive components."],
        requirements: ["Use React hooks."],
        instructions: "Create views for listing and editing tasks.",
        expectedOutcome: "A responsive React task manager interface."
      }
    }
  ],
  capstoneProjects: [
    {
      title: "MERN Task Manager",
      scenario: "Combine the API, database and frontend into a task-management application.",
      objectives: ["Connect client and API.", "Persist tasks in MongoDB."],
      requirements: ["Node.js", "Express.js", "React", "MongoDB"],
      instructions: "Build the app in milestones, add tests, and document deployment.",
      expectedOutcome: "A deployed, tested MERN application.",
      features: ["Task CRUD", "Validation", "Authentication"],
      milestones: ["API", "Database", "Frontend", "Deployment"],
      testingChecklist: ["Unit tests", "API integration tests"],
      githubWorkflow: ["Branch", "Commit", "Pull request"]
    }
  ]
};

// Populated from the first fixture-only CI run, then locked as a regression snapshot.
// Keep null only while capturing the baseline before any curation-engine changes.
export const phase0ExpectedSnapshots = {
  normalSearchRanked: null,
  builtCourse: null
};
