import { KTAssignment, RepositoryAnalysisResult, WorkspaceResponse } from "../types";
import { delay } from "../utils/delay";
import { repositoryService } from "./repositoryService";

const KT_ASSIGNMENTS_KEY = "synapseiq.ktAssignments";

function readAssignments(): Record<string, KTAssignment[]> {
  try {
    const stored = localStorage.getItem(KT_ASSIGNMENTS_KEY);
    return stored ? (JSON.parse(stored) as Record<string, KTAssignment[]>) : {};
  } catch {
    return {};
  }
}

function writeAssignments(assignments: Record<string, KTAssignment[]>) {
  localStorage.setItem(KT_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function buildRepositoryWorkspace(projectId: string, repository: RepositoryAnalysisResult): WorkspaceResponse {
  return {
    overview: {
      summary: repository.summary,
      architectureOverview: `${repository.projectName} is represented from GitHub metadata, root modules, language usage, and contributor activity. Full source-aware analysis can move behind the backend connector later.`,
      technologyStack: repository.technologyStack,
      integrations: [repository.repositoryType, "GitHub REST API"],
      repositoryStatistics: repository.metrics,
    },
    checklist: repository.estimatedKtAreas.slice(0, 8).map((area, index) => ({
      id: `${projectId}-check-${index}`,
      title: area,
      description: `Review repository knowledge area: ${area}.`,
      status: index === 0 ? "In Progress" : "Not Started",
      completionPercentage: index === 0 ? 35 : 0,
    })),
    smeRecommendations: repository.contributors.slice(0, 6).map((contributor) => ({
      id: contributor.id,
      name: contributor.name,
      expertiseAreas: contributor.expertiseAreas.length ? contributor.expertiseAreas : repository.technologyStack.slice(0, 3),
      contributionScore: Math.min(100, Math.max(50, contributor.commits)),
      confidenceScore: repository.technologyStack.length > 0 ? 82 : 64,
    })),
    assignments: readAssignments()[projectId] ?? [],
    knowledgeBase: [
      {
        id: `${projectId}-kb-overview`,
        section: "Overview",
        title: `${repository.projectName} Repository Overview`,
        content: repository.summary,
      },
      {
        id: `${projectId}-kb-architecture`,
        section: "Architecture",
        title: "Repository Structure",
        content: repository.modules.map((module) => `${module.name}: ${module.description}`).join(" "),
      },
      {
        id: `${projectId}-kb-modules`,
        section: "Modules",
        title: "Top-Level Modules",
        content: repository.modules.map((module) => module.name).join(", "),
      },
      {
        id: `${projectId}-kb-api`,
        section: "API Layer",
        title: "API Signals",
        content: repository.modules.some((module) => /api|service|server/i.test(module.name))
          ? "API or service-oriented modules were detected in the repository structure."
          : "No explicit API module was detected from the public root listing.",
      },
      {
        id: `${projectId}-kb-db`,
        section: "Database Layer",
        title: "Persistence Signals",
        content: repository.modules.some((module) => /db|database|data|store|model/i.test(module.name))
          ? "Data or persistence-oriented modules were detected in the repository structure."
          : "No explicit database module was detected from the public root listing.",
      },
      {
        id: `${projectId}-kb-deployment`,
        section: "Deployment",
        title: "Delivery Signals",
        content: repository.estimatedKtAreas.includes("CI/CD workflow")
          ? "GitHub workflow configuration was detected and should be reviewed for build, test, and release knowledge transfer."
          : "No root GitHub workflow directory was detected in the public metadata scan.",
      },
    ],
  };
}

export const workspaceService = {
  async getWorkspace(projectId: string): Promise<WorkspaceResponse> {
    const repository = await repositoryService.getRepositoryProject(projectId);
    if (!repository) {
      throw new Error("Project repository not found. Connect a GitHub repository first.");
    }
    return delay(buildRepositoryWorkspace(projectId, repository));
  },

  async createAssignment(assignment: KTAssignment): Promise<KTAssignment> {
    const assignmentsByProject = readAssignments();
    const projectId = assignment.id.split(":")[0] || "project";
    const nextAssignment = { ...assignment, id: `${projectId}:assign-${Date.now()}` };
    writeAssignments({
      ...assignmentsByProject,
      [projectId]: [nextAssignment, ...(assignmentsByProject[projectId] ?? [])],
    });
    return delay(nextAssignment);
  },

  async updateAssignment(assignment: KTAssignment): Promise<KTAssignment> {
    const assignmentsByProject = readAssignments();
    const projectId = assignment.id.split(":")[0];
    writeAssignments({
      ...assignmentsByProject,
      [projectId]: (assignmentsByProject[projectId] ?? []).map((item) => (item.id === assignment.id ? assignment : item)),
    });
    return delay(assignment);
  },

  async cancelAssignment(assignmentId: string): Promise<void> {
    const assignmentsByProject = readAssignments();
    const projectId = assignmentId.split(":")[0];
    writeAssignments({
      ...assignmentsByProject,
      [projectId]: (assignmentsByProject[projectId] ?? []).filter((item) => item.id !== assignmentId),
    });
    return delay(undefined);
  },
};
