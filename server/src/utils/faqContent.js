export const FAQ_CATEGORIES = Object.freeze([
  "getting-started",
  "accounts",
  "courses-learning",
  "plans-payments",
  "technical-support",
  "privacy-safety",
  "other",
]);

export const FAQ_CATEGORY_LABELS = Object.freeze({
  "getting-started": "Getting started",
  accounts: "Accounts",
  "courses-learning": "Courses & learning",
  "plans-payments": "Plans & payments",
  "technical-support": "Technical support",
  "privacy-safety": "Privacy & safety",
  other: "Other",
});

// These entries preserve the existing public FAQ answers. They are returned
// until administrators import them into the managed FAQ collection.
export const DEFAULT_FAQS = Object.freeze([
  {
    key: "default-where-can-i-find-courses",
    question: "Where can I find courses?",
    answer: "Open Explore to browse the courses currently available on BuddyForStudy. Course details show the information available for each course.",
    category: "courses-learning",
    displayOrder: 10,
    featured: false,
  },
  {
    key: "default-how-do-i-find-plans-and-prices",
    question: "How do I find plans and prices?",
    answer: "Visit the Pricing page to see subscription plans currently returned by the platform. Availability and prices may change as plans are updated.",
    category: "plans-payments",
    displayOrder: 20,
    featured: false,
  },
  {
    key: "default-can-i-learn-without-a-paid-subscription",
    question: "Can I learn without a paid subscription?",
    answer: "Course access depends on the course's displayed price and the access rules shown by the platform. Check the course details before enrolling.",
    category: "plans-payments",
    displayOrder: 30,
    featured: false,
  },
  {
    key: "default-how-do-i-return-to-a-course-i-started",
    question: "How do I return to a course I started?",
    answer: "Sign in and open My Learning to find your enrolled learning. The available course actions depend on your current enrollment.",
    category: "accounts",
    displayOrder: 40,
    featured: false,
  },
  {
    key: "default-where-can-i-read-platform-policies",
    question: "Where can I read the platform policies?",
    answer: "The Legal and Policies section links to the published policy documents. If a document is unavailable, check the policy index for current publications.",
    category: "privacy-safety",
    displayOrder: 50,
    featured: false,
  },
]);
