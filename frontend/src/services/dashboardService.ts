import { DashboardResponse, ProjectSummary, UserRole } from "../types";
import { delay } from "../utils/delay";
import { projectAccessService } from "./projectAccessService";
import { projectService } from "./projectService";

export type DashboardProject = ProjectSummary;
export type { DashboardResponse };

async function getLearnerProjects(projects: ProjectSummary[], userEmail: string) {
  const accessChecks = await Promise.all(
    projects.map(async (project) => ({
      project,
      canAccess: await projectAccessService.canAccessProject(project.id, userEmail),
    })),
  );
  return accessChecks.filter((item) => item.canAccess).map((item) => item.project);
}

export const dashboardService = {
  async getDashboard(role: UserRole, userEmail = ""): Promise<DashboardResponse> {
    const allProjects = await projectService.getProjects();
    const projects = role === "ADMIN" ? allProjects : await getLearnerProjects(allProjects, userEmail);

    if (role === "ADMIN") {
      return delay({
        stats: {
          totalProjects: projects.length,
          activeProjects: projects.filter((project) => project.status === "Active").length,
          pendingAssessments: projects.filter((project) => project.assessmentCompletion < 100).length,
          completedAssessments: projects.filter((project) => project.assessmentCompletion === 100).length,
        },
        projects,
      });
    }

    const completedScores = projects
      .map((project) => project.assessmentScore)
      .filter((score): score is number => typeof score === "number");

    return delay({
      stats: {
        assignedProjects: projects.length,
        pendingAssessments: projects.filter((project) => project.assessmentCompletion < 100).length,
        completedAssessments: projects.filter((project) => project.assessmentCompletion === 100).length,
        averageScore: completedScores.length
          ? Math.round(completedScores.reduce((total, score) => total + score, 0) / completedScores.length)
          : 0,
      },
      projects,
    });
  },
};
