export const DISCOVERY_FIXTURE_NOW = new Date("2026-11-26T10:00:00.000Z");

export const CROSS_DOMAIN_COURSES = [
  {
    _id: "react-software-course",
    title: "React Complete Tutorial",
    description: "Build interactive interfaces with React components and hooks.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react", "frontend"],
    level: "Beginner",
    duration: "12 hours",
    learningOutcomes: ["Build React components", "Use hooks"],
    moduleCount: 3,
    lessonCount: 12,
    ratingAverage: 4.6,
    ratingCount: 40,
    enrollmentCount: 180,
    createdAt: "2026-08-01T00:00:00.000Z"
  },
  {
    _id: "analytics-react-cross-domain",
    title: "React for Data Analytics Dashboards",
    description: "Use dashboard interfaces to inspect analytics and reports.",
    category: "Data Analytics",
    domain: "data-ai",
    tags: ["analytics", "dashboards"],
    level: "Intermediate",
    duration: "8 hours",
    learningOutcomes: ["Build dashboards"],
    moduleCount: 2,
    lessonCount: 5,
    ratingAverage: 4.9,
    ratingCount: 90,
    enrollmentCount: 900,
    createdAt: "2026-10-01T00:00:00.000Z"
  },
  {
    _id: "unknown-legacy-react-course",
    title: "React Essentials from a Legacy Catalogue",
    description: "A legacy course with no classified category.",
    category: "Special Topics",
    domain: null,
    tags: ["react"],
    level: "Beginner",
    duration: "5 hours",
    learningOutcomes: ["Understand React basics"],
    moduleCount: 1,
    lessonCount: 4,
    ratingAverage: 0,
    ratingCount: 0,
    enrollmentCount: 0,
    createdAt: "2025-06-01T00:00:00.000Z"
  },
  {
    _id: "contradictory-domain-metadata",
    title: "React Analytics with Conflicting Metadata",
    description: "This record has an explicit data domain and a legacy development category.",
    category: "Web Development",
    domain: "data-ai",
    tags: ["react"],
    level: "Intermediate",
    duration: "6 hours",
    learningOutcomes: ["Review conflicting metadata"],
    moduleCount: 1,
    lessonCount: 3,
    ratingAverage: 4.8,
    ratingCount: 70,
    enrollmentCount: 400,
    createdAt: "2026-09-01T00:00:00.000Z"
  }
];

export const RATING_CONFIDENCE_COURSES = [
  {
    _id: "one-five-star-review",
    title: "React with One Five-Star Review",
    description: "A React course with a very small review sample.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react"],
    learningOutcomes: ["Build an interface"],
    moduleCount: 2,
    lessonCount: 5,
    ratingAverage: 5,
    ratingCount: 1,
    enrollmentCount: 100,
    createdAt: "2026-10-01T00:00:00.000Z"
  },
  {
    _id: "established-4-7-rating",
    title: "React with Established Learner Feedback",
    description: "A React course with a large approved review sample.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react", "hooks"],
    learningOutcomes: ["Build interfaces", "Use hooks", "Manage state"],
    moduleCount: 4,
    lessonCount: 18,
    ratingAverage: 4.7,
    ratingCount: 150,
    enrollmentCount: 300,
    createdAt: "2026-07-01T00:00:00.000Z"
  }
];

export const QUALITY_ORDER_COURSES = [
  {
    _id: "complete-structured-course",
    title: "React Complete Structured Course",
    description: "A detailed course description covering setup, components, hooks, state management, routing, testing, performance, accessibility, projects and practical implementation.",
    category: "Web Development",
    domain: "software-development",
    tags: ["react", "frontend", "javascript"],
    duration: "40 hours",
    learningOutcomes: [
      "Build reusable components",
      "Manage application state",
      "Implement routing",
      "Test React applications",
      "Optimize performance"
    ],
    moduleCount: 5,
    lessonCount: 22,
    ratingAverage: 3.5,
    ratingCount: 0,
    enrollmentCount: 25,
    createdAt: "2026-06-01T00:00:00.000Z"
  },
  {
    _id: "sparse-five-star-course",
    title: "React Quick Tips",
    description: "Short notes.",
    category: "Web Development",
    domain: "software-development",
    tags: [],
    duration: "1 hour",
    learningOutcomes: [],
    moduleCount: 1,
    lessonCount: 1,
    ratingAverage: 5,
    ratingCount: 400,
    enrollmentCount: 1200,
    createdAt: "2026-11-20T00:00:00.000Z"
  }
];
