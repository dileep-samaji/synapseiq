import { PersonalDocumentType, ProjectDocument, ProjectDocumentType } from "../types";
import { delay } from "../utils/delay";

const PROJECT_DOCUMENTS_KEY = "synapseiq.projectDocuments";
const PERSONAL_DOCUMENTS_KEY = "synapseiq.personalDocuments";
const projectTypes: ProjectDocumentType[] = ["PDF", "DOCX", "PPTX", "TXT", "MD", "PNG", "JPG"];
const personalTypes: PersonalDocumentType[] = ["PDF", "DOCX", "TXT"];

function readDocuments(storageKey: string): ProjectDocument[] {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as ProjectDocument[]) : [];
  } catch {
    return [];
  }
}

function writeDocuments(storageKey: string, documents: ProjectDocument[]) {
  localStorage.setItem(storageKey, JSON.stringify(documents));
}

function getFileType(fileName: string) {
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}

export const documentService = {
  async getProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
    return delay(readDocuments(PROJECT_DOCUMENTS_KEY).filter((document) => document.projectId === projectId));
  },

  async getPersonalDocuments(projectId: string, ownerId: string): Promise<ProjectDocument[]> {
    return delay(
      readDocuments(PERSONAL_DOCUMENTS_KEY).filter((document) => document.projectId === projectId && document.ownerId === ownerId),
    );
  },

  async uploadProjectDocument(projectId: string, fileName: string, uploadedBy: string): Promise<ProjectDocument> {
    const fileType = getFileType(fileName) as ProjectDocumentType;
    if (!projectTypes.includes(fileType)) {
      throw new Error("Unsupported file type.");
    }

    const documents = readDocuments(PROJECT_DOCUMENTS_KEY);
    const document: ProjectDocument = {
      id: `project-doc-${Date.now()}`,
      projectId,
      fileName,
      fileType,
      uploadedBy,
      uploadedDate: new Date().toISOString().slice(0, 10),
      isOfficial: false,
      visibility: "project",
    };
    writeDocuments(PROJECT_DOCUMENTS_KEY, [document, ...documents]);
    return delay(document);
  },

  async uploadPersonalDocument(projectId: string, ownerId: string, fileName: string): Promise<ProjectDocument> {
    const fileType = getFileType(fileName) as PersonalDocumentType;
    if (!personalTypes.includes(fileType)) {
      throw new Error("Unsupported personal document type.");
    }

    const documents = readDocuments(PERSONAL_DOCUMENTS_KEY);
    const document: ProjectDocument = {
      id: `personal-doc-${Date.now()}`,
      projectId,
      fileName,
      fileType,
      uploadedBy: "You",
      uploadedDate: new Date().toISOString().slice(0, 10),
      isOfficial: false,
      visibility: "personal",
      ownerId,
    };
    writeDocuments(PERSONAL_DOCUMENTS_KEY, [document, ...documents]);
    return delay(document);
  },

  async deleteDocument(documentId: string): Promise<void> {
    writeDocuments(PROJECT_DOCUMENTS_KEY, readDocuments(PROJECT_DOCUMENTS_KEY).filter((document) => document.id !== documentId));
    writeDocuments(PERSONAL_DOCUMENTS_KEY, readDocuments(PERSONAL_DOCUMENTS_KEY).filter((document) => document.id !== documentId));
    return delay(undefined);
  },

  async replaceDocument(documentId: string, fileName: string): Promise<ProjectDocument> {
    const documents = readDocuments(PROJECT_DOCUMENTS_KEY);
    const existingDocument = documents.find((document) => document.id === documentId);
    if (!existingDocument) {
      throw new Error("Document not found.");
    }
    const fileType = getFileType(fileName) as ProjectDocumentType;
    if (!projectTypes.includes(fileType)) {
      throw new Error("Unsupported file type.");
    }
    const replacement = { ...existingDocument, fileName, fileType, uploadedDate: new Date().toISOString().slice(0, 10) };
    writeDocuments(PROJECT_DOCUMENTS_KEY, documents.map((document) => (document.id === documentId ? replacement : document)));
    return delay(replacement);
  },

  async markOfficial(documentId: string): Promise<ProjectDocument> {
    const documents = readDocuments(PROJECT_DOCUMENTS_KEY);
    const existingDocument = documents.find((document) => document.id === documentId);
    if (!existingDocument) {
      throw new Error("Document not found.");
    }
    const officialDocument = { ...existingDocument, isOfficial: true };
    writeDocuments(PROJECT_DOCUMENTS_KEY, documents.map((document) => (document.id === documentId ? officialDocument : document)));
    return delay(officialDocument);
  },
};
