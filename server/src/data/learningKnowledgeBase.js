const skill = ({ id, name, category, importance = "core", topics, project, searchQueries, durationMinutes = { min: 30, max: 180 }, prerequisites = [] }) => ({
  id, name, category, importance, topics, practiceProject: project, searchQueries, durationMinutes, prerequisites
});

const SKILLS = {
  html: skill({ id:"html", name:"HTML", category:"foundation", topics:["semantic HTML","forms","tables","accessibility","media elements"], project:"Build a responsive personal portfolio structure with semantic HTML", searchQueries:["HTML full course beginners semantic HTML forms","HTML tutorial beginners forms semantic HTML"], durationMinutes:{min:45,max:360} }),
  css: skill({ id:"css", name:"CSS", category:"foundation", topics:["selectors","box model","flexbox","grid","responsive design","media queries"], project:"Build a responsive landing page using HTML and CSS", searchQueries:["CSS full course beginners flexbox grid responsive design","CSS tutorial flexbox grid responsive web design"], durationMinutes:{min:60,max:480}, prerequisites:["html"] }),
  javascript: skill({ id:"javascript", name:"JavaScript", category:"language", topics:["variables","data types","functions","arrays","objects","DOM","events","promises","async await","fetch API","modules"], project:"Build a JavaScript task manager using DOM manipulation and a browser API", searchQueries:["JavaScript full course beginners DOM promises async await fetch","JavaScript complete course projects beginners"], durationMinutes:{min:180,max:900}, prerequisites:["html","css"] }),
  git: skill({ id:"git", name:"Git & GitHub", category:"tooling", topics:["repositories","commits","branches","merge","remote repositories","pull requests","collaboration"], project:"Publish a project to GitHub and practice a feature branch and pull request", searchQueries:["Git and GitHub full course beginners branches pull requests","Git GitHub tutorial beginners"], durationMinutes:{min:45,max:240} }),
  react: skill({ id:"react", name:"React", category:"frontend", topics:["JSX","components","props","state","events","hooks","useEffect","forms","React Router","API integration"], project:"Build a React task management application with routing and API integration", searchQueries:["React full course beginners hooks router API","React complete course projects beginners"], durationMinutes:{min:180,max:900}, prerequisites:["javascript"] }),
  node: skill({ id:"node", name:"Node.js", category:"backend", topics:["Node runtime","modules","npm","filesystem","HTTP","environment variables","asynchronous programming"], project:"Build a Node.js REST API without a framework", searchQueries:["Node.js full course beginners modules npm HTTP REST API","Node.js complete course beginners"], durationMinutes:{min:120,max:600}, prerequisites:["javascript"] }),
  express: skill({ id:"express", name:"Express.js", category:"backend", topics:["routing","middleware","controllers","REST APIs","validation","error handling","authentication"], project:"Build a production-style Express REST API with validation and error handling", searchQueries:["Express.js full course REST API middleware authentication","Express.js tutorial beginners REST API"], durationMinutes:{min:90,max:480}, prerequisites:["node"] }),
  cpp: skill({ id:"cpp", name:"C++", category:"language", topics:["syntax","variables","functions","arrays","strings","pointers","references","classes","STL","algorithms","OOP"], project:"Build a C++ console-based student management system", searchQueries:["C++ full course beginners OOP STL algorithms","C++ complete course beginners projects"], durationMinutes:{min:180,max:900} }),
  python: skill({ id:"python", name:"Python", category:"language", topics:["syntax","variables","data types","functions","collections","modules","exceptions","OOP","file handling"], project:"Build a Python CLI expense tracker", searchQueries:["Python full course beginners functions OOP file handling","Python complete course beginners projects"], durationMinutes:{min:180,max:900} }),
  mongodb: skill({ id:"mongodb", name:"MongoDB", category:"database", topics:["documents","collections","CRUD","queries","indexes","aggregation","Mongoose"], project:"Build a MongoDB CRUD API using Mongoose", searchQueries:["MongoDB full course beginners CRUD aggregation Mongoose","MongoDB complete course Mongoose Node.js"], durationMinutes:{min:120,max:600} })
};


const PYTHON_SKILLS = {
  python: SKILLS.python,
  python-control-flow: skill({ id:"python-control-flow", name:"Python Control Flow and Functions", category:"language", topics:["conditions","for and while loops","loop control","function definitions","parameters and return values","scope","lambda and comprehensions"], project:"Build a command-line quiz application with reusable functions", searchQueries:["Python control flow loops functions complete course tutorial","Python functions loops beginner full tutorial with exercises"], durationMinutes:{min:90,max:360}, prerequisites:["python"] }),
  python-data-structures: skill({ id:"python-data-structures", name:"Python Data Structures and Problem Solving", category:"language", topics:["strings","lists","tuples","sets","dictionaries","sorting","searching","time complexity basics"], project:"Build a contact book using dictionaries, lists and file persistence", searchQueries:["Python data structures lists dictionaries sets tuples full course","Python data structures problem solving beginner tutorial"], durationMinutes:{min:120,max:420}, prerequisites:["python-control-flow"] }),
  python-oop: skill({ id:"python-oop", name:"Object-Oriented Python", category:"language", topics:["classes and objects","constructors","instance and class attributes","inheritance","encapsulation","polymorphism","composition","dataclasses"], project:"Build an object-oriented library management system", searchQueries:["Python OOP complete course classes inheritance polymorphism projects","Python object oriented programming full tutorial"], durationMinutes:{min:120,max:420}, prerequisites:["python-data-structures"] }),
  python-files: skill({ id:"python-files", name:"Python Files, Exceptions and Modules", category:"language", topics:["text and binary files","CSV and JSON","pathlib","try except finally","custom exceptions","modules and packages","virtual environments","pip"], project:"Build a file organizer that reads CSV/JSON and handles errors safely", searchQueries:["Python file handling exceptions modules packages complete course","Python CSV JSON file handling pathlib tutorial"], durationMinutes:{min:90,max:360}, prerequisites:["python-oop"] }),
  python-tooling: skill({ id:"python-tooling", name:"Python Tooling, Testing and APIs", category:"tooling", topics:["venv and pip","debugging","logging","pytest basics","HTTP requests","JSON APIs","environment variables","type hints"], project:"Build and test a Python API client with logging and configuration", searchQueries:["Python pytest testing requests API logging complete tutorial","Python virtual environments pip debugging testing full course"], durationMinutes:{min:120,max:420}, prerequisites:["python-files"] }),
  python-automation: skill({ id:"python-automation", name:"Python Automation and Practical Applications", category:"applied", topics:["automating repetitive tasks","working with folders","Excel and CSV automation","web requests","scheduling scripts","data validation","CLI tools"], project:"Automate a weekly report from CSV and Excel files", searchQueries:["Python automation projects complete course files Excel CSV","Python practical automation full tutorial beginner projects"], durationMinutes:{min:120,max:480}, prerequisites:["python-tooling"] })
};

const CAREER_PATHS = {
  python: {
    id:"python",
    aliases:["python","python programming","learn python","python developer","python full course"],
    title:"Python Programming: Complete Beginner-to-Practical Course",
    description:"A structured Python curriculum covering syntax, control flow, data structures, functions, OOP, files, testing, APIs and practical automation projects.",
    category:"Programming",
    careerOutcome:"Write, test and automate real Python applications",
    skillOrder:["python","python-control-flow","python-data-structures","python-oop","python-files","python-tooling","python-automation"],
    capstone:{
      title:"Python Automation Portfolio Capstone",
      description:"Build a tested Python application that imports real CSV/Excel data, validates and transforms it, produces useful reports, and documents its setup and usage.",
      objectives:["Design a modular Python application","Use collections, functions and classes","Read and validate CSV/Excel/JSON data","Handle errors and log useful diagnostics","Write automated tests","Package and document the application"]
    }
  },

  mern: {
    id:"mern",
    aliases:["mern","mern stack","mern stack development","mern stack developer","mern stack roadmap"],
    title:"MERN Stack Development: From Fundamentals to Job-Ready",
    description:"A prerequisite-ordered path from web fundamentals to a complete MERN application.",
    category:"Web Development",
    careerOutcome:"MERN Stack Developer",
    skillOrder:["html","css","javascript","git","react","node","express","mongodb"],
    capstone:{
      title:"Build a Complete MERN Stack Application",
      description:"Build and deploy a full-stack application with React, Node.js, Express.js and MongoDB.",
      objectives:["Build a responsive React frontend","Design REST APIs with Express and Node.js","Persist application data in MongoDB","Implement authentication and authorization","Connect frontend and backend","Deploy the application"]
    }
  }
};

const ALIASES = new Map();
for (const path of Object.values(CAREER_PATHS)) for (const alias of path.aliases) ALIASES.set(alias, path.id);
for (const item of Object.values(SKILLS)) if (!ALIASES.has(item.name.toLowerCase())) ALIASES.set(item.name.toLowerCase(), item.id);

export function resolveLearningPath(query) {
  const normalized = String(query || "").trim().toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ");
  const pathId = ALIASES.get(normalized);
  if (pathId && CAREER_PATHS[pathId]) return { type:"career", path:CAREER_PATHS[pathId] };
  const skillId = ALIASES.get(normalized);
  if (skillId && SKILLS[skillId]) {
    return {
      type:"skill",
      path:{
        id:skillId,
        title:`${SKILLS[skillId].name}: Structured Learning Path`,
        description:`A focused prerequisite-ordered path for learning ${SKILLS[skillId].name} through tutorials and practical projects.`,
        category:"Technology",
        careerOutcome:`${SKILLS[skillId].name} Developer`,
        skillOrder:[skillId],
        capstone:null
      }
    };
  }
  return null;
}

export function getSkill(id) { return SKILLS[id] || null; }

export function listSupportedTopics() {
  return [...Object.values(CAREER_PATHS).map((path)=>path.title), ...Object.values(SKILLS).map((item)=>item.name)];
}
