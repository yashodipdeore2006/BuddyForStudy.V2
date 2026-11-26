import { cacheGet, cacheSet, cacheDelete } from "../config/cache.js";

const PUBLIC_COURSE_TAXONOMY_CACHE_KEY = "course-taxonomy:public:v2";
const PUBLIC_COURSE_TAXONOMY_TTL_MS = 5 * 60 * 1000;

let localValue = null;
let localValueAt = 0;

export async function getCachedCourseTaxonomy() {
  const sharedValue = await cacheGet(PUBLIC_COURSE_TAXONOMY_CACHE_KEY);
  if (sharedValue?.domains && Array.isArray(sharedValue.categories) && sharedValue.categoriesByDomain && typeof sharedValue.categoriesByDomain === "object") {
    localValue = sharedValue;
    localValueAt = Date.now();
    return sharedValue;
  }
  if (localValue && Date.now() - localValueAt < PUBLIC_COURSE_TAXONOMY_TTL_MS) {
    return localValue;
  }
  return null;
}

export async function setCachedCourseTaxonomy(value) {
  localValue = value;
  localValueAt = Date.now();
  await cacheSet(PUBLIC_COURSE_TAXONOMY_CACHE_KEY, value, 300);
}

export async function invalidateCourseTaxonomyCache() {
  localValue = null;
  localValueAt = 0;
  await cacheDelete(PUBLIC_COURSE_TAXONOMY_CACHE_KEY);
}
