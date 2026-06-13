import { RepositoryAnalysisResult, RepositoryConnectRequest } from "../types";

interface GitHubRepositoryResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  size: number;
  updated_at: string;
}

interface GitHubContributorResponse {
  id: number;
  login: string;
  contributions: number;
  html_url: string;
}

interface GitHubContentResponse {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
}

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const CONNECTED_REPOSITORIES_KEY = "synapseiq.connectedRepositories";

function slugifyProjectId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readConnectedRepositories(): RepositoryAnalysisResult[] {
  try {
    const stored = localStorage.getItem(CONNECTED_REPOSITORIES_KEY);
    return stored ? (JSON.parse(stored) as RepositoryAnalysisResult[]) : [];
  } catch {
    return [];
  }
}

function writeConnectedRepository(repository: RepositoryAnalysisResult) {
  const repositories = readConnectedRepositories();
  const nextRepositories = [
    repository,
    ...repositories.filter((item) => item.projectId !== repository.projectId && item.repositoryUrl !== repository.repositoryUrl),
  ];
  localStorage.setItem(CONNECTED_REPOSITORIES_KEY, JSON.stringify(nextRepositories));
}

function parseGitHubRepositoryUrl(repositoryUrl: string) {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error("Enter a valid repository URL.");
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("Real repository analysis currently supports public GitHub repositories only.");
  }

  const [owner, rawRepo] = url.pathname.replace(/^\/+/, "").split("/");
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!owner || !repo) {
    throw new Error("Enter a GitHub repository URL in the format https://github.com/owner/repo.");
  }

  return { owner, repo };
}

async function githubGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders,
  });

  if (response.status === 404) {
    throw new Error("GitHub repository not found or not public.");
  }
  if (response.status === 403) {
    throw new Error("GitHub API rate limit reached. Try again later or configure an authenticated backend connector.");
  }
  if (!response.ok) {
    throw new Error(`GitHub request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function inferTechnologyStack(languages: Record<string, number>, rootItems: GitHubContentResponse[]) {
  const stack = new Set(Object.keys(languages));
  const fileNames = rootItems.map((item) => item.name.toLowerCase());

  if (fileNames.includes("package.json")) stack.add("Node.js");
  if (fileNames.includes("vite.config.ts") || fileNames.includes("vite.config.js")) stack.add("Vite");
  if (fileNames.includes("next.config.js") || fileNames.includes("next.config.mjs")) stack.add("Next.js");
  if (fileNames.includes("requirements.txt") || fileNames.includes("pyproject.toml")) stack.add("Python");
  if (fileNames.includes("dockerfile") || fileNames.includes("docker-compose.yml")) stack.add("Docker");
  if (fileNames.includes("pom.xml")) stack.add("Java/Maven");
  if (fileNames.includes("build.gradle") || fileNames.includes("build.gradle.kts")) stack.add("Gradle");
  if (fileNames.includes("go.mod")) stack.add("Go Modules");
  if (fileNames.includes("cargo.toml")) stack.add("Rust/Cargo");

  return Array.from(stack).slice(0, 12);
}

function inferModules(rootItems: GitHubContentResponse[]) {
  const preferredDirectories = rootItems
    .filter((item) => item.type === "dir")
    .filter((item) => ![".git", ".github", "node_modules", "dist", "build", "coverage"].includes(item.name.toLowerCase()))
    .slice(0, 8);

  if (preferredDirectories.length === 0) {
    return [
      {
        name: "Repository root",
        description: "No top-level directories were returned by GitHub, so analysis is limited to repository-level metadata.",
      },
    ];
  }

  return preferredDirectories.map((item) => ({
    name: item.name,
    description: `Top-level repository module located at ${item.path}.`,
  }));
}

function inferKtAreas(repo: GitHubRepositoryResponse, languages: Record<string, number>, rootItems: GitHubContentResponse[]) {
  const fileNames = rootItems.map((item) => item.name.toLowerCase());
  const areas = new Set<string>();

  areas.add("Repository overview");
  if (repo.description) areas.add("Domain purpose");
  if (Object.keys(languages).length > 0) areas.add("Technology stack");
  if (fileNames.includes("readme.md")) areas.add("README and setup flow");
  if (fileNames.includes("package.json") || fileNames.includes("requirements.txt") || fileNames.includes("pyproject.toml")) areas.add("Dependency management");
  if (fileNames.includes("dockerfile") || fileNames.includes("docker-compose.yml")) areas.add("Containerization");
  if (rootItems.some((item) => item.name.toLowerCase() === ".github")) areas.add("CI/CD workflow");
  if (repo.open_issues_count > 0) areas.add("Open issue triage");

  return Array.from(areas);
}

export const repositoryService = {
  async connectRepository(payload: RepositoryConnectRequest): Promise<RepositoryAnalysisResult> {
    if (!payload.projectName.trim()) {
      throw new Error("Project name is required.");
    }
    if (payload.repositoryType !== "GitHub") {
      throw new Error("Real analysis is currently enabled for GitHub only. Azure DevOps, GitLab, and Bitbucket connectors can be added behind this service later.");
    }

    const { owner, repo } = parseGitHubRepositoryUrl(payload.repositoryUrl);
    const [repository, languages, contributors, rootItems] = await Promise.all([
      githubGet<GitHubRepositoryResponse>(`/repos/${owner}/${repo}`),
      githubGet<Record<string, number>>(`/repos/${owner}/${repo}/languages`),
      githubGet<GitHubContributorResponse[]>(`/repos/${owner}/${repo}/contributors?per_page=10`),
      githubGet<GitHubContentResponse[]>(`/repos/${owner}/${repo}/contents`),
    ]);

    const technologyStack = inferTechnologyStack(languages, rootItems);
    const modules = inferModules(rootItems);
    const estimatedKtAreas = inferKtAreas(repository, languages, rootItems);

    const analysis: RepositoryAnalysisResult = {
      id: String(repository.id),
      projectId: slugifyProjectId(payload.projectName || repository.name) || `${owner}-${repo}`,
      projectName: payload.projectName,
      repositoryUrl: repository.html_url,
      repositoryType: "GitHub",
      summary:
        repository.description ||
        `${repository.full_name} is a public GitHub repository with ${repository.default_branch} as the default branch.`,
      technologyStack,
      modules,
      contributors: contributors.map((contributor) => ({
        id: String(contributor.id),
        name: contributor.login,
        commits: contributor.contributions,
        expertiseAreas: technologyStack.slice(0, 3),
      })),
      metrics: [
        { label: "Stars", value: repository.stargazers_count.toLocaleString() },
        { label: "Forks", value: repository.forks_count.toLocaleString() },
        { label: "Open Issues", value: repository.open_issues_count.toLocaleString() },
        { label: "Repository Size", value: `${repository.size.toLocaleString()} KB` },
        { label: "Default Branch", value: repository.default_branch },
        { label: "Last Updated", value: repository.updated_at.slice(0, 10) },
      ],
      estimatedKtAreas,
    };

    writeConnectedRepository(analysis);
    return analysis;
  },

  async getRepositories(): Promise<RepositoryAnalysisResult[]> {
    return readConnectedRepositories();
  },

  async getRepositoryProject(projectId: string): Promise<RepositoryAnalysisResult | null> {
    return readConnectedRepositories().find((repository) => repository.projectId === projectId) ?? null;
  },
};
