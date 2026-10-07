import { resolveLearningPath, getSkill, listSupportedTopics } from "../data/learningKnowledgeBase.js";
import { attachYouTubeResources } from "./youtube.service.js";
import { generateModuleQuiz } from "./quiz.service.js";

function lessonId(skillId,suffix){return `${skillId}-${suffix}`;}

function buildCourse({path,level}){
  const modules=path.skillOrder.map((skillId,index)=>{
    const item=getSkill(skillId);
    return {
      title:item.name,
      description:`Learn ${item.name} through the core topics required for the next stage of the roadmap.`,
      skillIds:[item.id],
      order:index+1,
      quiz:null,
      lessons:[
        {id:lessonId(item.id,"tutorial"),title:`Learn ${item.name}`,description:`Master the essential ${item.name} concepts in prerequisite order.`,type:"tutorial",tutorial:{content:`Core topics: ${item.topics.join(", ")}.`,searchQuery:item.searchQueries[0],searchQueries:item.searchQueries,requiredTopics:item.topics,durationMinutes:item.durationMinutes}},
        {id:lessonId(item.id,"project"),title:item.practiceProject,description:"Apply the concepts from this stage in a practical project.",type:"project",project:{description:item.practiceProject,objectives:item.topics.slice(0,5).map((topic)=>`Use ${topic}`),requirements:item.topics.slice(0,5),instructions:`Build the project using only the skills introduced up to ${item.name}. Document your implementation and publish the source code.`,expectedOutcome:`A working project demonstrating practical ${item.name} skills.`,submissionRequirements:["Source code repository","README with setup instructions","Short project demonstration"]}}
      ]
    };
  });

  if(path.capstone) modules.push({
    title:path.capstone.title,description:path.capstone.description,skillIds:path.skillOrder,order:modules.length+1,quiz:null,
    lessons:[{id:"mern-capstone-project",title:path.capstone.title,description:path.capstone.description,type:"project",project:{description:path.capstone.description,objectives:path.capstone.objectives,requirements:path.capstone.objectives,instructions:"Plan the application, implement the frontend and backend, integrate the database, add authentication, test the main flows, and deploy the finished application.",expectedOutcome:"A production-style full-stack application with a public deployment and source repository.",submissionRequirements:["Source code repository","Deployed application URL","README","Project demo"]}}]
  });

  return {
    title:path.title,description:path.description,category:path.category,level,
    duration:`${Math.max(2,modules.length*2)}+ weeks`,
    learningOutcomes:[`Understand the prerequisite concepts required for ${path.title}`,"Build practical projects after each major learning stage","Use Git and GitHub to document and publish work",path.capstone?path.capstone.title:`Build a practical ${path.title} project`],
    modules
  };
}

export async function generateModuleQuizForRoadmap(userId, roadmapId, moduleIndex) {
  const roadmap = await LearningRoadmap.findOne({ _id: roadmapId, user: userId });
  if (!roadmap) { const error = new Error("Learning roadmap not found"); error.status = 404; throw error; }
  const module = roadmap.course?.modules?.[moduleIndex];
  if (!module) { const error = new Error("Roadmap module not found"); error.status = 404; throw error; }

  if (module.quiz?.questions?.length) return decorate(roadmap);

  module.quiz = await generateModuleQuiz({
    module,
    courseTitle: roadmap.course.title,
    level: roadmap.level
  });
  roadmap.markModified("course.modules");
  roadmap.lastAccessedAt = new Date();
  await roadmap.save();
  return decorate(roadmap);
}

export async function generateCoursePlan({topic,level="Beginner"}){
  const resolved=resolveLearningPath(topic);
  if(!resolved){
    const error=new Error(`No structured learning path is available for "${topic}". Supported starting topics include: ${listSupportedTopics().join(", ")}`);
    error.status=404;
    throw error;
  }
  const path=resolved.path;
  const course=buildCourse({path,level});
  const sources=await attachYouTubeResources(course);
  return {
    query:topic,intent:resolved.type==="career"?"career_path":"skill_path",canonicalTopic:path.title,careerOutcome:path.careerOutcome,
    skillGraph:path.skillOrder.map((skillId,index)=>{const item=getSkill(skillId);return {id:item.id,name:item.name,category:item.category,importance:item.importance,prerequisites:path.skillOrder.slice(0,index),practiceProject:item.practiceProject};}),
    course,sources
  };
}
