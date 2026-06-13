import { Assessment, AssessmentSubmission, ScoreSummary } from "../types";
import { delay } from "../utils/delay";
import { repositoryService } from "./repositoryService";

export const ASSESSMENT_RESULTS_KEY = "synapseiq.assessmentResults";

export interface StoredAssessmentResult extends ScoreSummary {
  assessmentId: string;
  assessmentName: string;
  projectId: string;
  submittedAt: string;
}

function haveExactSameAnswers(selectedAnswers: string[], correctAnswers: string[]) {
  if (selectedAnswers.length !== correctAnswers.length) return false;
  return correctAnswers.every((answerId) => selectedAnswers.includes(answerId));
}

function readResults(): StoredAssessmentResult[] {
  try {
    const stored = localStorage.getItem(ASSESSMENT_RESULTS_KEY);
    return stored ? (JSON.parse(stored) as StoredAssessmentResult[]) : [];
  } catch {
    return [];
  }
}

function writeResult(result: StoredAssessmentResult) {
  const results = readResults();
  localStorage.setItem(ASSESSMENT_RESULTS_KEY, JSON.stringify([result, ...results]));
}

export function calculateAssessmentScore(assessment: Assessment, answers: Record<string, string[]>): ScoreSummary {
  const correctAnswers = assessment.questions.reduce((total, question) => {
    const selectedAnswers = answers[question.id] ?? [];
    return total + (haveExactSameAnswers(selectedAnswers, question.correctAnswers) ? 1 : 0);
  }, 0);

  return {
    totalQuestions: assessment.questions.length,
    correctAnswers,
    wrongAnswers: assessment.questions.length - correctAnswers,
    scorePercentage: assessment.questions.length === 0 ? 0 : Math.round((correctAnswers / assessment.questions.length) * 100),
  };
}

export const assessmentService = {
  async getAssessments(projectId: string): Promise<Assessment[]> {
    const repository = await repositoryService.getRepositoryProject(projectId);
    if (!repository) {
      return delay([]);
    }

    const primaryStack = repository.technologyStack[0] ?? "the primary technology";
    const primaryModule = repository.modules[0]?.name ?? "the repository root";

    return delay([
      {
        id: `${projectId}-github-assessment`,
        projectId,
        name: `${repository.projectName} Repository Assessment`,
        durationMinutes: 10,
        type: "ai-generated",
        questions: [
          {
            id: `${projectId}-q-stack`,
            question: `Which technology was detected as part of ${repository.projectName}?`,
            type: "single",
            options: [
              { id: "a", label: primaryStack },
              { id: "b", label: "Unrelated legacy mainframe only" },
              { id: "c", label: "No technology metadata exists" },
              { id: "d", label: "Spreadsheet macros only" },
            ],
            correctAnswers: ["a"],
            explanation: "This answer comes from GitHub language and repository metadata analysis.",
            difficulty: "Easy",
            topic: "Technology Stack",
          },
          {
            id: `${projectId}-q-module`,
            question: `What should a learner inspect first to understand the ${primaryModule} area?`,
            type: "scenario",
            options: [
              { id: "a", label: `Review the ${primaryModule} directory/module and related README or configuration files` },
              { id: "b", label: "Ignore repository structure and ask for direct production access" },
              { id: "c", label: "Skip documentation and modify files immediately" },
              { id: "d", label: "Only count GitHub stars" },
            ],
            correctAnswers: ["a"],
            explanation: "Top-level modules provide the first map for repository KT.",
            difficulty: "Medium",
            topic: "Modules",
          },
          {
            id: `${projectId}-q-kt`,
            question: "Which items are valid KT areas inferred from this repository?",
            type: "multi",
            options: [
              { id: "a", label: repository.estimatedKtAreas[0] ?? "Repository overview" },
              { id: "b", label: repository.estimatedKtAreas[1] ?? "Technology stack" },
              { id: "c", label: "Private credentials copied from production" },
              { id: "d", label: repository.estimatedKtAreas[2] ?? "Dependency management" },
            ],
            correctAnswers: ["a", "b", "d"],
            explanation: "KT should use safe repository-derived knowledge areas, not private credentials.",
            difficulty: "Medium",
            topic: "Knowledge Transfer",
          },
        ],
      },
    ]);
  },

  async submitAssessment(submission: AssessmentSubmission): Promise<ScoreSummary> {
    const assessment = (await this.getAssessments(submission.projectId)).find((item) => item.id === submission.assessmentId);
    if (!assessment) {
      return delay({ totalQuestions: 0, correctAnswers: 0, wrongAnswers: 0, scorePercentage: 0 });
    }

    const score = calculateAssessmentScore(assessment, submission.answers);
    writeResult({
      ...score,
      projectId: submission.projectId,
      assessmentId: assessment.id,
      assessmentName: assessment.name,
      submittedAt: new Date().toISOString(),
    });
    return delay(score);
  },

  async getStoredResults(projectId: string): Promise<StoredAssessmentResult[]> {
    return delay(readResults().filter((result) => result.projectId === projectId));
  },
};
