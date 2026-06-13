import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, Modal } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { aiAssistantService } from "../services/aiAssistantService";
import { documentService } from "../services/documentService";
import { knowledgeBaseService } from "../services/knowledgeBaseService";
import { projectAccessService } from "../services/projectAccessService";
import { workspaceService } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import {
  AiAssistantMessage,
  AssignmentStatus,
  ChecklistStatus,
  KnowledgeDocument,
  KTAssignment,
  ProjectDocument,
  ProjectLearner,
  WorkspaceResponse,
} from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./Project.module.css";

type WorkspaceTab = "Overview" | "KT Checklist" | "SME Recommendations" | "KT Assignments" | "Knowledge Base" | "Documents" | "AI Assistant";

const checklistFilters: Array<ChecklistStatus | "All"> = ["All", "Not Started", "In Progress", "Completed"];
const assignmentStatuses: AssignmentStatus[] = ["Assigned", "In Progress", "Completed", "Overdue"];

function ProjectPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.roles[0]);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const [checklistFilter, setChecklistFilter] = useState<ChecklistStatus | "All">("All");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeCategory, setKnowledgeCategory] = useState<KnowledgeDocument["section"] | "All">("All");
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
  const [personalDocuments, setPersonalDocuments] = useState<ProjectDocument[]>([]);
  const [assignedLearners, setAssignedLearners] = useState<ProjectLearner[]>([]);
  const [availableLearners, setAvailableLearners] = useState<ProjectLearner[]>([]);
  const [aiMessages, setAiMessages] = useState<AiAssistantMessage[]>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiError, setAiError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [editingAssignment, setEditingAssignment] = useState<KTAssignment | null>(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    async function loadProjectWorkspace() {
      if (role === "LEARNER") {
        const canAccess = await projectAccessService.canAccessProject(projectId, user?.email ?? "");
        if (!canAccess) {
          navigate(ROUTES.dashboard, { replace: true });
          return;
        }
      }

      const [workspaceData, knowledgeBase, projectDocs, personalDocs, learners, available] = await Promise.all([
        workspaceService.getWorkspace(projectId),
        knowledgeBaseService.getKnowledgeBase(projectId),
        documentService.getProjectDocuments(projectId),
        documentService.getPersonalDocuments(projectId, user?.id ?? ""),
        projectAccessService.getAssignedLearners(projectId),
        projectAccessService.getAvailableLearners(),
      ]);

      workspaceData.knowledgeBase = knowledgeBase;
      if (isMounted) {
        setWorkspace(workspaceData);
        setProjectDocuments(projectDocs);
        setPersonalDocuments(personalDocs);
        setAssignedLearners(learners);
        setAvailableLearners(available);
      }
    }

    loadProjectWorkspace()
      .catch(() => {
        if (isMounted) {
          setError("Project workspace could not be loaded.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, projectId, role, user?.email, user?.id]);

  const refreshDocuments = async () => {
    const [projectDocs, personalDocs] = await Promise.all([
      documentService.getProjectDocuments(projectId),
      documentService.getPersonalDocuments(projectId, user?.id ?? ""),
    ]);
    setProjectDocuments(projectDocs);
    setPersonalDocuments(personalDocs);
  };

  const refreshLearners = async () => {
    setAssignedLearners(await projectAccessService.getAssignedLearners(projectId));
  };

  const handleAssignLearner = async (learnerId: string) => {
    if (!learnerId) return;
    setAssignedLearners(await projectAccessService.assignLearner(projectId, learnerId));
  };

  const handleRemoveLearner = async (learnerId: string) => {
    setAssignedLearners(await projectAccessService.removeLearner(projectId, learnerId));
  };

  const handleProjectDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocumentError("");
    try {
      await documentService.uploadProjectDocument(projectId, file.name, user?.name ?? "Admin User");
      await refreshDocuments();
    } catch (requestError) {
      setDocumentError(requestError instanceof Error ? requestError.message : "Document upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const handlePersonalDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocumentError("");
    try {
      await documentService.uploadPersonalDocument(projectId, user?.id ?? "", file.name);
      await refreshDocuments();
    } catch (requestError) {
      setDocumentError(requestError instanceof Error ? requestError.message : "Personal document upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const handleAskAi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAiError("");
    const question = aiQuestion.trim();
    if (!question) {
      setAiError("Enter a question for the AI assistant.");
      return;
    }

    try {
      const userMessage: AiAssistantMessage = { id: `user-${Date.now()}`, role: "user", content: question };
      setAiMessages((current) => [...current, userMessage]);
      setAiQuestion("");
      const response = await aiAssistantService.askQuestion(projectId, question);
      setAiMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: response.answer, sources: response.sources },
      ]);
  } catch (requestError) {
      setAiError(requestError instanceof Error ? requestError.message : "AI assistant service failed.");
    }
  };

  const tabs: WorkspaceTab[] = role === "ADMIN"
    ? ["Overview", "KT Checklist", "SME Recommendations", "KT Assignments", "Knowledge Base", "Documents", "AI Assistant"]
    : ["Overview", "KT Checklist", "SME Recommendations", "Knowledge Base", "Documents", "AI Assistant"];

  const filteredChecklist = useMemo(() => {
    const items = workspace?.checklist ?? [];
    return checklistFilter === "All" ? items : items.filter((item) => item.status === checklistFilter);
  }, [checklistFilter, workspace?.checklist]);

  const filteredDocuments = useMemo(() => {
    const documents = workspace?.knowledgeBase ?? [];
    const query = knowledgeSearch.trim().toLowerCase();
    const categoryDocuments = knowledgeCategory === "All"
      ? documents
      : documents.filter((document) => document.section === knowledgeCategory);
    if (!query) return categoryDocuments;
    return categoryDocuments.filter(
      (document) =>
        document.title.toLowerCase().includes(query) ||
        document.section.toLowerCase().includes(query) ||
        document.content.toLowerCase().includes(query),
    );
  }, [knowledgeCategory, knowledgeSearch, workspace?.knowledgeBase]);

  const refreshAssignments = async () => {
    const nextWorkspace = await workspaceService.getWorkspace(projectId);
    setWorkspace(nextWorkspace);
  };

  const handleAssignmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const assignment: KTAssignment = {
      id: editingAssignment?.id ?? projectId,
      sme: String(formData.get("sme") || "").trim(),
      learner: String(formData.get("learner") || "").trim(),
      dueDate: String(formData.get("dueDate") || ""),
      status: String(formData.get("status") || "Assigned") as AssignmentStatus,
    };

    if (editingAssignment) {
      await workspaceService.updateAssignment(assignment);
    } else {
      await workspaceService.createAssignment(assignment);
    }

    setIsAssignmentModalOpen(false);
    setEditingAssignment(null);
    await refreshAssignments();
  };

  const handleCancelAssignment = async (assignmentId: string) => {
    await workspaceService.cancelAssignment(assignmentId);
    await refreshAssignments();
  };

  if (isLoading) {
    return <div className={styles.state}>Loading project workspace...</div>;
  }

  if (error || !workspace) {
    return <div className={styles.state}>{error || "No project workspace data available."}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Project Workspace</p>
          <h1 className={styles.heading}>{projectId}</h1>
        </div>
        <div className={styles.actions}>
          {role === "LEARNER" && (
            <Button type="button" onClick={() => navigate(ROUTES.projectAssessment.replace(":projectId", projectId))}>
              Take Assessment
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.projectResults.replace(":projectId", projectId))}>
            View Results
          </Button>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Project workspace tabs">
        {tabs.map((tab) => (
          <button className={activeTab === tab ? styles.activeTab : styles.tab} key={tab} onClick={() => setActiveTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Overview</h2>
            <p>{workspace.overview.summary}</p>
          </div>
          <div className={styles.gridTwo}>
            <article className={styles.block}>
              <h3>Architecture Overview</h3>
              <p>{workspace.overview.architectureOverview}</p>
            </article>
            <article className={styles.block}>
              <h3>Technology Stack</h3>
              <div className={styles.tags}>{workspace.overview.technologyStack.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Integrations</h3>
              <div className={styles.tags}>{workspace.overview.integrations.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Repository Statistics</h3>
              <div className={styles.metricGrid}>
                {workspace.overview.repositoryStatistics.map((stat) => (
                  <div className={styles.metric} key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </article>
            {role === "ADMIN" && (
              <article className={styles.block}>
                <h3>Assigned Learners</h3>
                <div className={styles.inlineForm}>
                  <select defaultValue="" onChange={(event) => handleAssignLearner(event.target.value)}>
                    <option value="" disabled>Assign learner</option>
                    {availableLearners.map((learner) => (
                      <option key={learner.id} value={learner.id}>{learner.name}</option>
                    ))}
                  </select>
                </div>
                {assignedLearners.length === 0 ? (
                  <p>No learners assigned.</p>
                ) : (
                  <div className={styles.assignedList}>
                    {assignedLearners.map((learner) => (
                      <div key={learner.id} className={styles.assignedLearner}>
                        <span>{learner.name}</span>
                        <button type="button" onClick={() => handleRemoveLearner(learner.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )}
          </div>
        </section>
      )}

      {activeTab === "KT Checklist" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>KT Checklist</h2>
            <select value={checklistFilter} onChange={(event) => setChecklistFilter(event.target.value as ChecklistStatus | "All")}>
              {checklistFilters.map((filter) => <option key={filter}>{filter}</option>)}
            </select>
          </div>
          <div className={styles.list}>
            {filteredChecklist.map((item) => (
              <article className={styles.rowCard} key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <div className={styles.progressBox}>
                  <span>{item.status}</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${item.completionPercentage}%` }} />
                  </div>
                  <small>{item.completionPercentage}%</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "SME Recommendations" && (
        <section className={styles.panel}>
          <div className={styles.notice}>SME recommendations are generated from GitHub contributor activity and should be validated by the project admin.</div>
          <div className={styles.list}>
            {workspace.smeRecommendations.map((sme) => (
              <article className={styles.rowCard} key={sme.id}>
                <div>
                  <h3>{sme.name}</h3>
                  <div className={styles.tags}>{sme.expertiseAreas.map((area) => <span key={area}>{area}</span>)}</div>
                </div>
                <div className={styles.scorePair}>
                  <span>Contribution {sme.contributionScore}</span>
                  <span>Confidence {sme.confidenceScore}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "KT Assignments" && role === "ADMIN" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>KT Assignments</h2>
            <Button type="button" onClick={() => setIsAssignmentModalOpen(true)}>Create Assignment</Button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SME</th>
                  <th>Learner</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspace.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.sme}</td>
                    <td>{assignment.learner}</td>
                    <td>{assignment.dueDate}</td>
                    <td>{assignment.status}</td>
                    <td className={styles.tableActions}>
                      <button type="button" onClick={() => { setEditingAssignment(assignment); setIsAssignmentModalOpen(true); }}>Edit</button>
                      <button type="button" onClick={() => handleCancelAssignment(assignment.id)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "Knowledge Base" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Knowledge Base</h2>
            <div className={styles.filters}>
              <select value={knowledgeCategory} onChange={(event) => setKnowledgeCategory(event.target.value as KnowledgeDocument["section"] | "All")}>
                <option>All</option>
                <option>Overview</option>
                <option>Architecture</option>
                <option>Modules</option>
                <option>API Layer</option>
                <option>Database Layer</option>
                <option>Deployment</option>
              </select>
              <input value={knowledgeSearch} onChange={(event) => setKnowledgeSearch(event.target.value)} placeholder="Search knowledge base" type="search" />
            </div>
          </div>
          {filteredDocuments.length === 0 ? (
            <EmptyState title="No knowledge base content" description="No generated KT documents match this search." />
          ) : (
            <div className={styles.list}>
              {filteredDocuments.map((document) => (
                <article className={styles.doc} key={document.id}>
                  <button type="button" onClick={() => setExpandedDocs((current) => ({ ...current, [document.id]: !current[document.id] }))}>
                    <span>{document.section}: {document.title}</span>
                    <span>{expandedDocs[document.id] ? "Collapse" : "Expand"}</span>
                  </button>
                  {expandedDocs[document.id] && <p>{document.content}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "Documents" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Documents</h2>
              <p>Project documents are the curated KT layer between repository knowledge and learners.</p>
            </div>
            {role === "ADMIN" ? (
              <label className={styles.uploadButton}>
                Upload Document
                <input accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg" type="file" onChange={handleProjectDocumentUpload} />
              </label>
            ) : (
              <label className={styles.uploadButton}>
                Upload Personal
                <input accept=".pdf,.docx,.txt" type="file" onChange={handlePersonalDocumentUpload} />
              </label>
            )}
          </div>
          {documentError && <div className={styles.error}>{documentError}</div>}
          {projectDocuments.length === 0 ? (
            <EmptyState title="Empty document list" description="No official or project documents have been uploaded yet." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>File Type</th>
                    <th>Uploaded By</th>
                    <th>Uploaded Date</th>
                    <th>Official</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectDocuments.map((document) => (
                    <tr key={document.id}>
                      <td>{document.fileName}</td>
                      <td>{document.fileType}</td>
                      <td>{document.uploadedBy}</td>
                      <td>{document.uploadedDate}</td>
                      <td>{document.isOfficial ? "Yes" : "No"}</td>
                      <td className={styles.tableActions}>
                        <button type="button">Download</button>
                        {role === "ADMIN" && (
                          <>
                            <button type="button" onClick={() => documentService.markOfficial(document.id).then(refreshDocuments)}>Mark Official</button>
                            <button type="button" onClick={() => documentService.replaceDocument(document.id, document.fileName).then(refreshDocuments)}>Replace</button>
                            <button type="button" onClick={() => documentService.deleteDocument(document.id).then(refreshDocuments)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {role === "LEARNER" && (
            <div className={styles.personalDocs}>
              <h3>Personal AI Analysis Uploads</h3>
              {personalDocuments.length === 0 ? (
                <p>No personal documents uploaded.</p>
              ) : (
                <div className={styles.list}>
                  {personalDocuments.map((document) => (
                    <article className={styles.rowCard} key={document.id}>
                      <div>
                        <h3>{document.fileName}</h3>
                        <p>{document.fileType} - visible only to you</p>
                      </div>
                      <button type="button" onClick={() => documentService.deleteDocument(document.id).then(refreshDocuments)}>Delete</button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "AI Assistant" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>AI KT Assistant</h2>
              <p>Ask project questions using GitHub repository analysis, generated knowledge base, and uploaded official documents.</p>
            </div>
          </div>
          <div className={styles.chat}>
            {aiMessages.length === 0 ? (
              <EmptyState title="No AI conversation yet" description="Try asking how authentication works or which module handles payments." />
            ) : (
              aiMessages.map((message) => (
                <article className={message.role === "assistant" ? styles.assistantMessage : styles.userMessage} key={message.id}>
                  <p>{message.content}</p>
                  {message.sources && (
                    <div className={styles.sources}>
                      <strong>Sources</strong>
                      {message.sources.map((source) => <span key={source}>{source}</span>)}
                    </div>
                  )}
                </article>
              ))
            )}
            {aiError && <div className={styles.error}>{aiError}</div>}
            <form className={styles.aiForm} onSubmit={handleAskAi}>
              <input value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Ask about authentication, architecture, modules, or deployment" />
              <Button type="submit">Ask</Button>
            </form>
          </div>
        </section>
      )}

      <Modal
        isOpen={isAssignmentModalOpen}
        onClose={() => { setIsAssignmentModalOpen(false); setEditingAssignment(null); }}
        title={editingAssignment ? "Edit Assignment" : "Create Assignment"}
      >
        <form className={styles.form} onSubmit={handleAssignmentSubmit}>
          <label>
            SME
            <input name="sme" required defaultValue={editingAssignment?.sme ?? ""} />
          </label>
          <label>
            Learner
            <input name="learner" required defaultValue={editingAssignment?.learner ?? ""} />
          </label>
          <label>
            Due Date
            <input name="dueDate" required type="date" defaultValue={editingAssignment?.dueDate ?? "2026-06-20"} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={editingAssignment?.status ?? "Assigned"}>
              {assignmentStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <Button type="submit">{editingAssignment ? "Save Assignment" : "Create Assignment"}</Button>
        </form>
      </Modal>
    </div>
  );
}

export default ProjectPage;
