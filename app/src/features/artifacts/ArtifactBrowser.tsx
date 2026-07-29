import { useEffect, useState } from 'react';

import { CoordinatorError, type Artifact } from '../../lib/client';
import { getWorkspaceClient, useWorkspaceStore } from '../../store/workspaceStore';

export interface ArtifactBrowserProps {
  runId: string;
  taskId?: string | null;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export default function ArtifactBrowser({ runId, taskId }: ArtifactBrowserProps) {
  const baseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWorkspaceClient().listArtifacts(runId)
      .then((response) => {
        if (cancelled) return;
        const items = taskId
          ? response.artifacts.filter((artifact) => artifact.task_id === taskId)
          : response.artifacts;
        setArtifacts(items);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof CoordinatorError) {
          setError({ code: reason.code, message: reason.message });
        } else {
          setError({
            code: 'client_error',
            message: reason instanceof Error ? reason.message : '加载产物失败',
          });
        }
        setArtifacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [runId, taskId]);

  return (
    <section className="artifact-browser" aria-label="产物浏览">
      <header>
        <h3>真实产物</h3>
        {loading && <span className="muted">加载中…</span>}
      </header>
      {error && (
        <div className="inline-error" role="alert">
          <strong>{error.code}</strong>
          <span>{error.message}</span>
        </div>
      )}
      {!error && artifacts.length === 0 && !loading ? (
        <p className="muted">暂无产物</p>
      ) : (
        <ul className="artifact-list">
          {artifacts.map((artifact) => {
            const href = `${baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(runId)}/artifacts/download?path=${encodeURIComponent(artifact.relative_path)}`;
            return (
              <li key={artifact.id}>
                <a href={href} target="_blank" rel="noreferrer">
                  {fileName(artifact.relative_path)}
                </a>
                <span>{formatSize(artifact.size)}</span>
                <span className="muted">{artifact.media_type}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
