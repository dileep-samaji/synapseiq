import { ResultResponse, UserRole } from "../types";
import { delay } from "../utils/delay";
import { assessmentService } from "./assessmentService";
import { repositoryService } from "./repositoryService";

const emptyResult = (projectId: string): ResultResponse => ({
  projectId,
  overallScore: null,
  categoryScores: [],
  strengths: [],
  knowledgeGaps: [],
  recommendedLearningPath: [],
  assessmentHistory: [],
  teamResults: [],
});

export const resultService = {
  async getResults(projectId: string, role: UserRole): Promise<ResultResponse> {
    const repository = await repositoryService.getRepositoryProject(projectId);
    if (!repository) {
      return delay(emptyResult(projectId));
    }

    const results = await assessmentService.getStoredResults(projectId);
    const latestResult = results[0];
    if (!latestResult) {
      return delay(emptyResult(projectId));
    }

    const response: ResultResponse = {
      projectId,
      overallScore: latestResult.scorePercentage,
      categoryScores: [
        { category: "Backend", score: latestResult.scorePercentage },
        { category: "Frontend", score: Math.max(0, latestResult.scorePercentage - 5) },
        { category: "Database", score: Math.max(0, latestResult.scorePercentage - 8) },
        { category: "Infrastructure", score: Math.max(0, latestResult.scorePercentage - 3) },
        { category: "Security", score: Math.max(0, latestResult.scorePercentage - 6) },
      ],
      strengths: repository.technologyStack.slice(0, 2).map((item) => `Understands ${item} signals from repository analysis`),
      knowledgeGaps: repository.estimatedKtAreas.slice(2, 5).map((item) => `Review ${item}`),
      recommendedLearningPath: repository.estimatedKtAreas.slice(0, 4).map((item) => `Complete KT review for ${item}`),
      assessmentHistory: results.map((result) => ({
        id: `${result.assessmentId}-${result.submittedAt}`,
        date: result.submittedAt.slice(0, 10),
        assessmentName: result.assessmentName,
        score: result.scorePercentage,
      })),
      teamResults: role === "ADMIN"
        ? results.map((result, index) => ({
            learner: `Submission ${index + 1}`,
            project: repository.projectName,
            score: result.scorePercentage,
            status: "Completed",
          }))
        : undefined,
    };

    return delay(response);
  },
};
