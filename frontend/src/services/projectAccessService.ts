import { ProjectLearner } from "../types";
import { delay } from "../utils/delay";
import { normalizeRole } from "../utils/roles";
import { REGISTERED_USERS_KEY } from "./authService";

const PROJECT_LEARNERS_KEY = "synapseiq.projectLearners";

function readLearnerAccounts(): ProjectLearner[] {
  try {
    const stored = localStorage.getItem(REGISTERED_USERS_KEY);
    const users = stored ? (JSON.parse(stored) as Array<{ id: string; name: string; email: string; roles?: unknown[] }>) : [];
    return users
      .filter((user) => normalizeRole(user.roles?.[0]) === "LEARNER")
      .map((user) => ({ id: user.id, name: user.name, email: user.email }));
  } catch {
    return [];
  }
}

function readProjectLearners(): Record<string, ProjectLearner[]> {
  try {
    const stored = localStorage.getItem(PROJECT_LEARNERS_KEY);
    return stored ? (JSON.parse(stored) as Record<string, ProjectLearner[]>) : {};
  } catch {
    return {};
  }
}

function writeProjectLearners(projectLearners: Record<string, ProjectLearner[]>) {
  localStorage.setItem(PROJECT_LEARNERS_KEY, JSON.stringify(projectLearners));
}

export const projectAccessService = {
  async getAvailableLearners(): Promise<ProjectLearner[]> {
    return delay(readLearnerAccounts());
  },

  async getAssignedLearners(projectId: string): Promise<ProjectLearner[]> {
    return delay(readProjectLearners()[projectId] ?? []);
  },

  async assignLearner(projectId: string, learnerId: string): Promise<ProjectLearner[]> {
    const learner = readLearnerAccounts().find((item) => item.id === learnerId);
    if (!learner) {
      throw new Error("Learner account not found. Ask the employee to sign up as a Learner first.");
    }

    const projectLearners = readProjectLearners();
    const currentLearners = projectLearners[projectId] ?? [];
    const nextLearners = currentLearners.some((item) => item.id === learner.id)
      ? currentLearners
      : [...currentLearners, learner];

    writeProjectLearners({ ...projectLearners, [projectId]: nextLearners });
    return delay(nextLearners);
  },

  async removeLearner(projectId: string, learnerId: string): Promise<ProjectLearner[]> {
    const projectLearners = readProjectLearners();
    const nextLearners = (projectLearners[projectId] ?? []).filter((learner) => learner.id !== learnerId);
    writeProjectLearners({ ...projectLearners, [projectId]: nextLearners });
    return delay(nextLearners);
  },

  async canAccessProject(projectId: string, userEmail: string): Promise<boolean> {
    const assignedLearners = readProjectLearners()[projectId] ?? [];
    return delay(assignedLearners.some((learner) => learner.email.toLowerCase() === userEmail.toLowerCase()));
  },
};
