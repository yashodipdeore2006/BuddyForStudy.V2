import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_youtube_multilanguage_test";
process.env.JWT_SECRET ||= "youtube-multilanguage-test-only-secret";
process.env.GEMINI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "test-youtube-key";

const { attachYouTubeResources } = await import("./youtube.service.js");
const {
  __setNodeCurationSelectorForTests,
  __setNodeCurationCacheForTests
} = await import("./nodeCuration.service.js");

test("Build with AI retries the next selected language when the first has no suitable resource", async () => {
  const attemptedLanguages = [];
  __setNodeCurationSelectorForTests(async (_query, options) => {
    attemptedLanguages.push(options.language);
    if (options.language === "en") {
      return { resources: [], meta: { searchCalls: 1, quotaUnits: 1 } };
    }
    if (options.language === "hi") {
      return {
        resources: [{
          videoId: "AbCdEf123456",
          sourceType: "video",
          title: "Python complete course in Hindi",
          description: "A structured Hindi course covering Python fundamentals and practical exercises.",
          channelTitle: "Example Learning",
          defaultAudioLanguage: "hi",
          durationSeconds: 5400,
          url: "https://www.youtube.com/watch?v=AbCdEf123456",
          score: 88
        }],
        meta: { searchCalls: 1, quotaUnits: 1 }
      };
    }
    return { resources: [], meta: { searchCalls: 1, quotaUnits: 1 } };
  });
  __setNodeCurationCacheForTests({
    read: async () => null,
    write: async () => {}
  });

  const course = {
    title: "Python",
    level: "Beginner",
    modules: [{
      title: "Python Foundations",
      skillIds: ["python-foundations"],
      lessons: [{
        id: "python-foundations-lesson",
        title: "Python Foundations",
        type: "tutorial",
        tutorial: {
          requiredTopics: ["Python syntax", "variables", "data types"],
          searchQuery: "Python foundations complete course",
          searchQueries: ["Python fundamentals complete course"],
          durationMinutes: { minMinutes: 30, targetMinutes: 60, maxMinutes: 180 },
          searchPolicy: { minDurationMinutes: 30, targetDurationMinutes: 60, maxDurationMinutes: 180 }
        }
      }]
    }]
  };

  try {
    const sources = await attachYouTubeResources(course, {
      topic: "Python",
      level: "Beginner",
      language: "en",
      languages: ["en", "hi"],
      useCurationEngineForAi: true
    });

    assert.deepEqual(attemptedLanguages, ["en", "hi"]);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].resourceLanguage, "hi");
    assert.equal(course.modules[0].lessons[0].tutorial.selection.resourceLanguage, "hi");
    assert.equal(course.modules[0].lessons[0].tutorial.videos[0].defaultAudioLanguage, "hi");
  } finally {
    __setNodeCurationSelectorForTests(null);
    __setNodeCurationCacheForTests(null);
  }
});
