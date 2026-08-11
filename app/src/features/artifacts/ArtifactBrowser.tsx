import { useEffect, useState } from 'react';

import { CoordinatorError, type Artifact } from '../../lib/client';
import { useI18n } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { getWorkspaceClient, useWorkspaceStore } from '../../store/workspaceStore';

export interface ArtifactBrowserProps {
  runId: string;
  taskId?: string | null;
}

type Translate = ReturnType<typeof useI18n>['t'];

function formatSize(t: Translate, size: number): string {
  if (size < 1024) return t('artifacts.bytes', { value: size });
  if (size < 1024 * 1024) return t('artifacts.kb', { value: (size / 1024).toFixed(1) });
  return t('artifacts.mb', { value: (size / (1024 * 1024)).toFixed(1) });
}

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export default function ArtifactBrowser({ runId, taskId }: ArtifactBrowserProps) {
  const baseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const sessionToken = useWorkspaceStore((state) => state.coordinatorSessionToken);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { mediaTypeLabel } = useLabels();

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
            message: t('artifacts.loadError'),
          });
        }
        setArtifacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [runId, t, taskId]);

  return (
    <section className="artifact-browser" aria-label={t('artifacts.aria')}>
      <header>
        <h3>{t('artifacts.title')}</h3>
        {loading && <span className="muted">{t('common.loading')}</span>}
      </header>
      {error && (
        <div className="inline-error" role="alert">
          <strong>{t('common.loadFailed')}</strong>
          <span>{error.message}</span>
        </div>
      )}
      {!error && artifacts.length === 0 && !loading ? (
        <p className="muted">{t('artifacts.empty')}</p>
      ) : (
        <ul className="artifact-list">
          {artifacts.map((artifact) => {
            const query = new URLSearchParams({ path: artifact.relative_path });
            if (sessionToken) query.set('session_token', sessionToken);
            const href = `${baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(runId)}/artifacts/download?${query}`;
            return (
              <li key={artifact.id}>
                <a href={href} target="_blank" rel="noreferrer">
                  {fileName(artifact.relative_path)}
                </a>
                <span>{formatSize(t, artifact.size)}</span>
                <span className="muted">{mediaTypeLabel(artifact.media_type)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
