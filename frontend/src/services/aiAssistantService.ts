import { AiAssistantResponse } from "../types";
import { delay } from "../utils/delay";
import { documentService } from "./documentService";
import { repositoryService } from "./repositoryService";

export const aiAssistantService = {
  async askQuestion(projectId: string, question: string): Promise<AiAssistantResponse> {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      throw new Error("Enter a question for the AI assistant.");
    }

    const repository = await repositoryService.getRepositoryProject(projectId);
    if (!repository) {
      throw new Error("No repository knowledge available. Connect a GitHub repository first.");
    }

    const projectDocuments = await documentService.getProjectDocuments(projectId);
    const lowerQuestion = trimmedQuestion.toLowerCase();
    const moduleNames = repository.modules.map((module) => module.name).join(", ");
    const stack = repository.technologyStack.join(", ");
    const contributors = repository.contributors.slice(0, 3).map((contributor) => contributor.name).join(", ");

    const answer = lowerQuestion.includes("module")
      ? `The visible top-level modules are ${moduleNames || "not available from the GitHub root listing"}. These are the first areas to review for KT.`
      : lowerQuestion.includes("tech") || lowerQuestion.includes("stack")
        ? `The detected technology stack is ${stack || "not available from GitHub language metadata"}.`
        : lowerQuestion.includes("who") || lowerQuestion.includes("expert") || lowerQuestion.includes("sme")
          ? `Likely SMEs from public contributor activity are ${contributors || "not available"}. Use contribution data as a signal, not final ownership.`
          : lowerQuestion.includes("deploy")
            ? repository.estimatedKtAreas.includes("CI/CD workflow")
              ? "GitHub workflow configuration was detected, so review CI/CD workflow files for deployment knowledge."
              : "No root GitHub workflow directory was detected from public metadata; deployment knowledge may be in docs or external tooling."
            : `${repository.projectName}: ${repository.summary}`;

    return delay({
      answer,
      sources: [
        repository.repositoryUrl,
        "GitHub repository metadata",
        "GitHub languages API",
        "GitHub contributors API",
        ...projectDocuments.filter((document) => document.isOfficial).map((document) => document.fileName),
      ],
    }, 500);
  },
};
