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
  const [downloading, setDownloading] = useState<string | null>(null);
  const { t } = useI18n();
  const { mediaTypeLabel } = useLabels();

  // 产物下载使用 header 会话认证 + Blob，不把长期会话令牌写进 URL、历史或 referer
  const download = async (artifact: Artifact) => {
    setDownloading(artifact.id);
    setError(null);
    try {
      const query = new URLSearchParams({ path: artifact.relative_path });
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(runId)}/artifacts/download?${query}`,
        { headers: sessionToken ? { 'X-Xuanji-Session': sessionToken } : {} },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new CoordinatorError(
          response.status,
          payload?.error?.code ?? 'http_error',
          payload?.error?.message ?? '',
          payload?.error?.details ?? {},
        );
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName(artifact.relative_path);
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (reason) {
      if (reason instanceof CoordinatorError) {
        setError({ code: reason.code, message: reason.message });
      } else {
        setError({ code: 'client_error', message: t('artifacts.loadError') });
      }
    } finally {
      setDownloading(null);
    }
  };

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
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                className="artifact-download"
                onClick={() => void download(artifact)}
                disabled={downloading === artifact.id}
              >
                {fileName(artifact.relative_path)}
              </button>
              <span>{formatSize(t, artifact.size)}</span>
              <span className="muted">{mediaTypeLabel(artifact.media_type)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
