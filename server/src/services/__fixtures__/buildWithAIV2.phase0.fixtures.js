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

// Locked to the unmodified Phase 0 baseline; update only with an explicit regression review.
export const phase0ExpectedSnapshots = {
  normalSearchRanked: [{"id":"video:phase0-mern-004","score":81},{"id":"video:phase0-mern-008","score":78},{"id":"video:phase0-mern-003","score":77},{"id":"video:phase0-mern-002","score":75},{"id":"video:phase0-mern-006","score":70},{"id":"video:phase0-mern-005","score":66},{"id":"video:phase0-mern-007","score":65},{"id":"video:phase0-mern-001","score":62}],
  builtCourse: {"title":"MERN Stack Development Roadmap","description":"Build practical full-stack web applications with MongoDB, Express.js, React and Node.js.","category":"Web Development","level":"Beginner","duration":"22 study days at 60 min/day","learningOutcomes":["Build REST APIs with Express.js and Node.js.","Create interactive interfaces with React.","Model and query application data with MongoDB.","Build practical projects that prove your ability to apply the stack.","Use Git and GitHub with professional collaboration and documentation practices.","Test, debug, secure, and deploy applications instead of stopping at tutorial completion."],"modules":[{"title":"JavaScript and Node.js","description":"AI-selected JavaScript and Node.js stage for a Beginner learner, ordered after prerequisites.","skillIds":["javascript-runtime"],"order":1,"lessons":[{"id":"javascript-runtime-tutorial-1","title":"Learn JavaScript and Node.js","description":"Cover JavaScript syntax, Node.js modules, async programming in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: JavaScript syntax, Node.js modules, async programming.","searchQuery":"JavaScript and Node.js: JavaScript syntax, Node.js modules, async programming complete tutorial","searchQueries":["JavaScript and Node.js: JavaScript syntax, Node.js modules, async programming complete tutorial","JavaScript Node.js foundations"],"requiredTopics":["JavaScript syntax","Node.js modules","async programming"],"durationMinutes":{"minMinutes":120,"targetMinutes":180,"maxMinutes":240},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":120,"targetDurationMinutes":180,"maxDurationMinutes":240,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"javascript-runtime-quiz-1","title":"JavaScript and Node.js Lesson Quiz","description":"Check your understanding of JavaScript syntax, Node.js modules, async programming before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["JavaScript syntax","Node.js modules","async programming"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"javascript-runtime-project","title":"Command-line task tracker","description":"Create a small command-line task tracker.","type":"project","order":3,"project":{"description":"Command-line task tracker","realWorldScenario":"Create a small command-line task tracker.","objectives":["Apply the core JavaScript and Node.js concepts in a working application."],"requirements":["JavaScript and Node.js"],"instructions":"Scenario: Create a small command-line task tracker.\n\nImplement the project incrementally. Use clean code, meaningful Git commits, validation, error handling, and documentation.","expectedOutcome":"A working project that solves the scenario: Create a small command-line task tracker.","features":[],"architecture":[],"milestones":[],"testingChecklist":[],"industrySkills":[],"githubWorkflow":[],"videoSearchQueries":[],"resources":[],"videos":[],"submissionRequirements":["Source code repository on GitHub","README with setup, architecture, and usage","Test evidence or test suite","Deployed application or recorded demo where applicable","Short explanation of technical decisions"]}},{"id":"javascript-runtime-module-quiz","title":"JavaScript and Node.js Module Assessment","description":"An assessment covering the major topics of JavaScript and Node.js.","type":"quiz","order":4,"quiz":{"scope":"module","questionCount":6,"passingScore":70,"focusTopics":["JavaScript syntax","Node.js modules","async programming"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"Git & GitHub Workflow","description":"AI-selected Git & GitHub Workflow stage for a Beginner learner, ordered after prerequisites.","skillIds":["git-github-workflow"],"order":2,"lessons":[{"id":"git-github-workflow-tutorial-1","title":"Git & GitHub Workflow — Part 1: Git fundamentals & branching","description":"Cover Git fundamentals, branching, commits, merge and rebase basics, pull requests in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: Git fundamentals, branching, commits, merge and rebase basics, pull requests.","searchQuery":"Git & GitHub Workflow: Git fundamentals, branching, commits, merge and rebase basics, pull requests complete tutorial","searchQueries":["Git & GitHub Workflow: Git fundamentals, branching, commits, merge and rebase basics, pull requests complete tutorial","Git and GitHub for beginners complete tutorial","GitHub workflow pull requests branches tutorial"],"requiredTopics":["Git fundamentals","branching","commits","merge and rebase basics","pull requests"],"durationMinutes":{"minMinutes":90,"targetMinutes":150,"maxMinutes":240},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":90,"targetDurationMinutes":150,"maxDurationMinutes":240,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"git-github-workflow-quiz-1","title":"Git & GitHub Workflow — Part 1 Quiz","description":"Check your understanding of Git fundamentals, branching, commits, merge and rebase basics, pull requests before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":5,"passingScore":70,"focusTopics":["Git fundamentals","branching","commits","merge and rebase basics","pull requests"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"git-github-workflow-tutorial-2","title":"Git & GitHub Workflow — Part 2: GitHub repositories & issues","description":"Cover GitHub repositories, issues, README and collaboration in a Beginner-level lesson with practical context.","type":"tutorial","order":3,"tutorial":{"content":"Core topics: GitHub repositories, issues, README and collaboration.","searchQuery":"Git & GitHub Workflow: GitHub repositories, issues, README and collaboration complete tutorial","searchQueries":["Git & GitHub Workflow: GitHub repositories, issues, README and collaboration complete tutorial","Git and GitHub for beginners complete tutorial","GitHub workflow pull requests branches tutorial"],"requiredTopics":["GitHub repositories","issues","README and collaboration"],"durationMinutes":{"minMinutes":90,"targetMinutes":150,"maxMinutes":240},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":90,"targetDurationMinutes":150,"maxDurationMinutes":240,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"git-github-workflow-quiz-2","title":"Git & GitHub Workflow — Part 2 Quiz","description":"Check your understanding of GitHub repositories, issues, README and collaboration before continuing.","type":"quiz","order":4,"quiz":{"scope":"lesson","questionCount":5,"passingScore":70,"focusTopics":["GitHub repositories","issues","README and collaboration"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"git-github-workflow-module-quiz","title":"Git & GitHub Workflow Module Assessment","description":"An assessment covering the major topics of Git & GitHub Workflow.","type":"quiz","order":5,"quiz":{"scope":"module","questionCount":8,"passingScore":70,"focusTopics":["Git fundamentals","branching","commits","merge and rebase basics","pull requests","GitHub repositories","issues","README and collaboration"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"Express.js APIs","description":"AI-selected Express.js APIs stage for a Beginner learner, ordered after prerequisites.","skillIds":["express-api"],"order":3,"lessons":[{"id":"express-api-tutorial-1","title":"Learn Express.js APIs","description":"Cover Express routing, REST API design, middleware in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: Express routing, REST API design, middleware.","searchQuery":"Express.js APIs: Express routing, REST API design, middleware complete tutorial","searchQueries":["Express.js APIs: Express routing, REST API design, middleware complete tutorial","Express.js REST API course"],"requiredTopics":["Express routing","REST API design","middleware"],"durationMinutes":{"minMinutes":180,"targetMinutes":240,"maxMinutes":300},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":180,"targetDurationMinutes":240,"maxDurationMinutes":300,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"express-api-quiz-1","title":"Express.js APIs Lesson Quiz","description":"Check your understanding of Express routing, REST API design, middleware before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["Express routing","REST API design","middleware"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"express-api-project","title":"Task management REST API","description":"Create a REST API for task management.","type":"project","order":3,"project":{"description":"Task management REST API","realWorldScenario":"Create a REST API for task management.","objectives":["Apply the core Express.js APIs concepts in a working application."],"requirements":["Express.js APIs"],"instructions":"Scenario: Create a REST API for task management.\n\nImplement the project incrementally. Use clean code, meaningful Git commits, validation, error handling, and documentation.","expectedOutcome":"A working project that solves the scenario: Create a REST API for task management.","features":[],"architecture":[],"milestones":[],"testingChecklist":[],"industrySkills":[],"githubWorkflow":[],"videoSearchQueries":[],"resources":[],"videos":[],"submissionRequirements":["Source code repository on GitHub","README with setup, architecture, and usage","Test evidence or test suite","Deployed application or recorded demo where applicable","Short explanation of technical decisions"]}},{"id":"express-api-module-quiz","title":"Express.js APIs Module Assessment","description":"An assessment covering the major topics of Express.js APIs.","type":"quiz","order":4,"quiz":{"scope":"module","questionCount":6,"passingScore":70,"focusTopics":["Express routing","REST API design","middleware"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"React UI","description":"AI-selected React UI stage for a Beginner learner, ordered after prerequisites.","skillIds":["react-ui"],"order":4,"lessons":[{"id":"react-ui-tutorial-1","title":"Learn React UI","description":"Cover React components, React hooks, state management in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: React components, React hooks, state management.","searchQuery":"React UI: React components, React hooks, state management complete tutorial","searchQueries":["React UI: React components, React hooks, state management complete tutorial","React components hooks state course"],"requiredTopics":["React components","React hooks","state management"],"durationMinutes":{"minMinutes":180,"targetMinutes":240,"maxMinutes":300},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":180,"targetDurationMinutes":240,"maxDurationMinutes":300,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"react-ui-quiz-1","title":"React UI Lesson Quiz","description":"Check your understanding of React components, React hooks, state management before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["React components","React hooks","state management"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"react-ui-project","title":"Task manager interface","description":"Create the frontend for a task manager.","type":"project","order":3,"project":{"description":"Task manager interface","realWorldScenario":"Create the frontend for a task manager.","objectives":["Apply the core React UI concepts in a working application."],"requirements":["React UI"],"instructions":"Scenario: Create the frontend for a task manager.\n\nImplement the project incrementally. Use clean code, meaningful Git commits, validation, error handling, and documentation.","expectedOutcome":"A working project that solves the scenario: Create the frontend for a task manager.","features":[],"architecture":[],"milestones":[],"testingChecklist":[],"industrySkills":[],"githubWorkflow":[],"videoSearchQueries":[],"resources":[],"videos":[],"submissionRequirements":["Source code repository on GitHub","README with setup, architecture, and usage","Test evidence or test suite","Deployed application or recorded demo where applicable","Short explanation of technical decisions"]}},{"id":"react-ui-module-quiz","title":"React UI Module Assessment","description":"An assessment covering the major topics of React UI.","type":"quiz","order":4,"quiz":{"scope":"module","questionCount":6,"passingScore":70,"focusTopics":["React components","React hooks","state management"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"Testing, Debugging & Quality","description":"AI-selected Testing, Debugging & Quality stage for a Beginner learner, ordered after prerequisites.","skillIds":["testing-debugging-quality"],"order":5,"lessons":[{"id":"testing-debugging-quality-tutorial-1","title":"Testing, Debugging & Quality — Part 1: unit testing & integration testing","description":"Cover unit testing, integration testing, debugging, linting, validation in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: unit testing, integration testing, debugging, linting, validation.","searchQuery":"Testing, Debugging & Quality: unit testing, integration testing, debugging, linting, validation complete tutorial","searchQueries":["Testing, Debugging & Quality: unit testing, integration testing, debugging, linting, validation complete tutorial","web application testing debugging complete tutorial","JavaScript Node React testing debugging tutorial"],"requiredTopics":["unit testing","integration testing","debugging","linting","validation"],"durationMinutes":{"minMinutes":60,"targetMinutes":90,"maxMinutes":150},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":60,"targetDurationMinutes":90,"maxDurationMinutes":150,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"testing-debugging-quality-quiz-1","title":"Testing, Debugging & Quality — Part 1 Quiz","description":"Check your understanding of unit testing, integration testing, debugging, linting, validation before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["unit testing","integration testing","debugging","linting","validation"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"testing-debugging-quality-tutorial-2","title":"Testing, Debugging & Quality — Part 2: error handling","description":"Cover error handling in a Beginner-level lesson with practical context.","type":"tutorial","order":3,"tutorial":{"content":"Core topics: error handling.","searchQuery":"Testing, Debugging & Quality: error handling complete tutorial","searchQueries":["Testing, Debugging & Quality: error handling complete tutorial","web application testing debugging complete tutorial","JavaScript Node React testing debugging tutorial"],"requiredTopics":["error handling"],"durationMinutes":{"minMinutes":60,"targetMinutes":90,"maxMinutes":150},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":60,"targetDurationMinutes":90,"maxDurationMinutes":150,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"testing-debugging-quality-quiz-2","title":"Testing, Debugging & Quality — Part 2 Quiz","description":"Check your understanding of error handling before continuing.","type":"quiz","order":4,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["error handling"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"testing-debugging-quality-module-quiz","title":"Testing, Debugging & Quality Module Assessment","description":"An assessment covering the major topics of Testing, Debugging & Quality.","type":"quiz","order":5,"quiz":{"scope":"module","questionCount":5,"passingScore":70,"focusTopics":["unit testing","integration testing","debugging","linting","validation","error handling"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"Deployment, Security & Production","description":"AI-selected Deployment, Security & Production stage for a Beginner learner, ordered after prerequisites.","skillIds":["deployment-security-production"],"order":6,"lessons":[{"id":"deployment-security-production-tutorial-1","title":"Deployment, Security & Production — Part 1: deployment & environment variables","description":"Cover deployment, environment variables, security basics, HTTPS, production configuration in a Beginner-level lesson with practical context.","type":"tutorial","order":1,"tutorial":{"content":"Core topics: deployment, environment variables, security basics, HTTPS, production configuration.","searchQuery":"Deployment, Security & Production: deployment, environment variables, security basics, HTTPS, production configuration complete tutorial","searchQueries":["Deployment, Security & Production: deployment, environment variables, security basics, HTTPS, production configuration complete tutorial","web app deployment security production complete tutorial","MERN production deployment security tutorial"],"requiredTopics":["deployment","environment variables","security basics","HTTPS","production configuration"],"durationMinutes":{"minMinutes":60,"targetMinutes":90,"maxMinutes":150},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":60,"targetDurationMinutes":90,"maxDurationMinutes":150,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"deployment-security-production-quiz-1","title":"Deployment, Security & Production — Part 1 Quiz","description":"Check your understanding of deployment, environment variables, security basics, HTTPS, production configuration before continuing.","type":"quiz","order":2,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["deployment","environment variables","security basics","HTTPS","production configuration"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"deployment-security-production-tutorial-2","title":"Deployment, Security & Production — Part 2: monitoring","description":"Cover monitoring in a Beginner-level lesson with practical context.","type":"tutorial","order":3,"tutorial":{"content":"Core topics: monitoring.","searchQuery":"Deployment, Security & Production: monitoring complete tutorial","searchQueries":["Deployment, Security & Production: monitoring complete tutorial","web app deployment security production complete tutorial","MERN production deployment security tutorial"],"requiredTopics":["monitoring"],"durationMinutes":{"minMinutes":60,"targetMinutes":90,"maxMinutes":150},"searchPolicy":{"contentType":"complete-course","minDurationMinutes":60,"targetDurationMinutes":90,"maxDurationMinutes":150,"excludeShorts":true,"requireEmbeddable":true,"preferProjectBased":true,"preferredLanguage":"en"}}},{"id":"deployment-security-production-quiz-2","title":"Deployment, Security & Production — Part 2 Quiz","description":"Check your understanding of monitoring before continuing.","type":"quiz","order":4,"quiz":{"scope":"lesson","questionCount":4,"passingScore":70,"focusTopics":["monitoring"],"instructions":"Pass this quiz before moving to the next learning item. Questions are generated from the lesson topics."}},{"id":"deployment-security-production-module-quiz","title":"Deployment, Security & Production Module Assessment","description":"An assessment covering the major topics of Deployment, Security & Production.","type":"quiz","order":5,"quiz":{"scope":"module","questionCount":5,"passingScore":70,"focusTopics":["deployment","environment variables","security basics","HTTPS","production configuration","monitoring"],"instructions":"Validate the whole module before continuing to the next technology."}}]},{"title":"Final Capstone Projects","description":"Build portfolio-grade projects that combine the technologies learned across the roadmap.","skillIds":["javascript-runtime","git-github-workflow","express-api","react-ui","testing-debugging-quality","deployment-security-production"],"order":7,"lessons":[{"id":"capstone-project-1","title":"MERN Task Manager","description":"Combine the API, database and frontend into a task-management application.","type":"project","order":1,"project":{"description":"MERN Task Manager","realWorldScenario":"Combine the API, database and frontend into a task-management application.","objectives":["Implement: Task CRUD","Implement: Validation","Implement: Authentication"],"requirements":["MERN Stack Development Roadmap"],"instructions":"Scenario: Combine the API, database and frontend into a task-management application.\n\nMilestones: 1. API | 2. Database | 3. Frontend | 4. Deployment\n\nImplement the project incrementally. Use clean code, meaningful Git commits, validation, error handling, and documentation.\n\nTesting checklist: Unit tests | API integration tests\n\nGitHub workflow: Branch | Commit | Pull request","expectedOutcome":"A working project that solves the scenario: Combine the API, database and frontend into a task-management application.","features":["Task CRUD","Validation","Authentication"],"architecture":[],"milestones":["API","Database","Frontend","Deployment"],"testingChecklist":["Unit tests","API integration tests"],"industrySkills":[],"githubWorkflow":["Branch","Commit","Pull request"],"videoSearchQueries":[],"resources":[],"videos":[],"submissionRequirements":["Source code repository on GitHub","README with setup, architecture, and usage","Test evidence or test suite","Deployed application or recorded demo where applicable","Short explanation of technical decisions"]}}]}]}
};
