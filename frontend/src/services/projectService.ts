import { ProjectSummary, RepositoryAnalysisResult } from "../types";
import { delay } from "../utils/delay";
import { repositoryService } from "./repositoryService";

function connectedRepositoryToProject(repository: RepositoryAnalysisResult): ProjectSummary {
  return {
    id: repository.projectId,
    name: repository.projectName,
    repository: repository.repositoryUrl,
    status: "Active",
    ktProgress: 35,
    assessmentCompletion: 0,
    assessmentScore: null,
    nextAssessment: "Generated on demand",
  };
}

export const projectService = {
  async getProjects(): Promise<ProjectSummary[]> {
    const connectedProjects = (await repositoryService.getRepositories()).map(connectedRepositoryToProject);
    return delay(connectedProjects);
  },

  async getProject(projectId: string): Promise<ProjectSummary | null> {
    const projects = await this.getProjects();
    return delay(projects.find((project) => project.id === projectId) ?? null);
  },
};
