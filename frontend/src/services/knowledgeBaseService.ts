import { KnowledgeDocument } from "../types";
import { delay } from "../utils/delay";
import { workspaceService } from "./workspaceService";

export const knowledgeBaseService = {
  async getKnowledgeBase(projectId: string): Promise<KnowledgeDocument[]> {
    const workspace = await workspaceService.getWorkspace(projectId);
    return delay(workspace.knowledgeBase);
  },
};
