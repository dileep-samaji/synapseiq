import { FormEvent, useEffect, useState } from "react";
import { Button, EmptyState } from "../components/common";
import { projectAccessService } from "../services/projectAccessService";
import { repositoryService } from "../services/repositoryService";
import { ProjectLearner, RepositoryAnalysisResult, RepositoryType } from "../types";
import styles from "./RepositoryOnboard.module.css";

const repositoryTypes: RepositoryType[] = ["Azure DevOps", "GitHub", "GitLab", "Bitbucket"];

function RepositoryOnboardPage() {
  const [analysis, setAnalysis] = useState<RepositoryAnalysisResult | null>(null);
  const [availableLearners, setAvailableLearners] = useState<ProjectLearner[]>([]);
  const [assignedLearners, setAssignedLearners] = useState<ProjectLearner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    projectAccessService.getAvailableLearners().then(setAvailableLearners).catch(() => setAvailableLearners([]));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setIsLoading(true);

    try {
      const result = await repositoryService.connectRepository({
        projectName: String(formData.get("projectName") || ""),
        repositoryUrl: String(formData.get("repositoryUrl") || ""),
        repositoryType: String(formData.get("repositoryType") || "Azure DevOps") as RepositoryType,
      });
      setAnalysis(result);
      setAssignedLearners(await projectAccessService.getAssignedLearners(result.projectId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Repository analysis failed.");
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignLearner = async (learnerId: string) => {
    if (!analysis || !learnerId) return;
    setAssignedLearners(await projectAccessService.assignLearner(analysis.projectId, learnerId));
  };

  const handleRemoveLearner = async (learnerId: string) => {
    if (!analysis) return;
    setAssignedLearners(await projectAccessService.removeLearner(analysis.projectId, learnerId));
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Admin Only</p>
          <h1 className={styles.heading}>Repository Onboarding</h1>
          <p>Connect a public GitHub repository to generate SynapseIQ analysis. No repository cloning is performed.</p>
        </div>
      </section>

      <section className={styles.panel}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Project Name
            <input name="projectName" placeholder="React" required />
          </label>
          <label>
            Repository URL
            <input name="repositoryUrl" placeholder="https://github.com/facebook/react" required />
          </label>
          <label>
            Repository Type
            <select name="repositoryType" defaultValue="GitHub">
              {repositoryTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <p className={styles.hint}>Real data is currently enabled for public GitHub repositories. Other providers remain service extension points.</p>
          {error && <div className={styles.error}>{error}</div>}
          <Button type="submit" isLoading={isLoading}>Connect Repository</Button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Repository Analysis Result</h2>
        </div>
        {!analysis ? (
          <EmptyState title="No repository analysis yet" description="Submit a public GitHub repository to view summary, modules, contributors, metrics, and KT areas." />
        ) : (
          <div className={styles.analysis}>
            <article className={styles.block}>
              <h3>Repository Summary</h3>
              <p>{analysis.summary}</p>
            </article>
            <article className={styles.block}>
              <h3>Technology Stack</h3>
              <div className={styles.tags}>{analysis.technologyStack.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Modules</h3>
              <div className={styles.list}>{analysis.modules.map((item) => <p key={item.name}><strong>{item.name}</strong>: {item.description}</p>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Contributors</h3>
              <div className={styles.list}>{analysis.contributors.map((item) => <p key={item.id}><strong>{item.name}</strong>: {item.commits} contributions</p>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Repository Metrics</h3>
              <div className={styles.metricGrid}>{analysis.metrics.map((metric) => <div className={styles.metric} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Estimated KT Areas</h3>
              <div className={styles.tags}>{analysis.estimatedKtAreas.map((area) => <span key={area}>{area}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Project Access</h3>
              <p>Assign learner accounts to make this repository-backed project visible on their dashboard.</p>
              <select className={styles.select} defaultValue="" onChange={(event) => handleAssignLearner(event.target.value)}>
                <option value="" disabled>Assign learner</option>
                {availableLearners.map((learner) => (
                  <option key={learner.id} value={learner.id}>{learner.name} ({learner.email})</option>
                ))}
              </select>
              {assignedLearners.length === 0 ? (
                <p>No learners assigned yet.</p>
              ) : (
                <div className={styles.assignedList}>
                  {assignedLearners.map((learner) => (
                    <div className={styles.assignedLearner} key={learner.id}>
                      <span>{learner.name}</span>
                      <button type="button" onClick={() => handleRemoveLearner(learner.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        )}
      </section>
    </div>
  );
}

export default RepositoryOnboardPage;
