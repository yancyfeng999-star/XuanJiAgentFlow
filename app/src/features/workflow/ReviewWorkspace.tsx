import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

import { CoordinatorError, type ReviewPrepareResult } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ReviewWorkspace({ onClose }: { onClose: () => void }) {
  const t = useT();
  const workflow = useWorkspaceStore((state) => state.workflow);
  const prepareReview = useWorkspaceStore((state) => state.prepareReview);
  const reviewWorkflow = useWorkspaceStore((state) => state.reviewWorkflow);
  const reviewing = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'review'));
  const [prepared, setPrepared] = useState<ReviewPrepareResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [stale, setStale] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setStale(false);
    setAcknowledged(false);
    setPrepared(await prepareReview());
  }, [prepareReview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!workflow) return null;

  const confirm = async () => {
    if (!prepared) return;
    try {
      await reviewWorkflow(
        prepared.snapshot_hash,
        acknowledged ? [...new Set(prepared.warnings.map((warning) => warning.code))] : [],
      );
      onClose();
    } catch (error) {
      if (error instanceof CoordinatorError && error.code === 'review_snapshot_stale') {
        setStale(true);
      }
    }
  };

  const blockers = prepared?.blockers ?? [];
  const warnings = prepared?.warnings ?? [];
  const confirmDisabled = !prepared || reviewing || blockers.length > 0 || (warnings.length > 0 && !acknowledged);

  return (
    <div className="modal-backdrop">
      <div
        className="review-workspace"
        role="dialog"
        aria-modal="true"
        aria-label={t('review.workspace')}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="review-head">
          <h2>{t('review.workspace')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('review.close')}>
            <X size={16} />
          </button>
        </header>
        {!prepared ? (
          <p className="muted">{t('common.loading')}</p>
        ) : (
          <div className="review-body">
            <section aria-label={t('review.section.summary')}>
              <h3>{t('review.section.summary')}</h3>
              <dl className="review-summary">
                <div><dt>{t('review.taskCount')}</dt><dd>{prepared.task_count}</dd></div>
                <div><dt>{t('review.snapshot')}</dt><dd><code>{prepared.snapshot_hash.slice(0, 16)}…</code></dd></div>
                <div><dt>{t('review.order')}</dt><dd>{prepared.topological_order.join(' → ')}</dd></div>
              </dl>
            </section>
            <section aria-label={t('review.section.tasks')}>
              <h3>{t('review.section.tasks')}</h3>
              <ul className="review-tasks">
                {prepared.tasks.map((task) => (
                  <li key={task.task_id}>
                    <strong>{task.title}</strong>
                    <span className="muted">
                      {task.dependencies.length > 0
                        ? t('review.dependsOn', { deps: task.dependencies.join(', ') })
                        : t('review.noDeps')}
                    </span>
                    <span>
                      {task.matching_node_ids.length > 0
                        ? t('review.matchedNodes', { nodes: task.matching_node_ids.join(', ') })
                        : t('review.noMatchedNodes')}
                    </span>
                    <span>
                      {task.writes.length > 0
                        ? t('review.writes', { writes: task.writes.join(', ') })
                        : t('review.noWrites')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {blockers.length > 0 && (
              <section className="review-blockers" aria-label={t('review.section.blockers')}>
                <h3>{t('review.section.blockers')}</h3>
                <ul>
                  {blockers.map((blocker) => (
                    <li key={blocker.code}><strong>{blocker.title}</strong><span>{blocker.message}</span></li>
                  ))}
                </ul>
              </section>
            )}
            {warnings.length > 0 && (
              <section className="review-warnings" aria-label={t('review.section.warnings')}>
                <h3>{t('review.section.warnings')}</h3>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={`${warning.code}-${warning.task_id ?? index}`}>
                      <strong>{warning.title}</strong><span>{warning.message}</span>
                    </li>
                  ))}
                </ul>
                <label className="check-row" htmlFor="ack-warnings">
                  <input
                    id="ack-warnings"
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  {t('review.ackWarnings')}
                </label>
              </section>
            )}
            {stale && (
              <p className="review-stale" role="alert">
                {t('review.stale')}
                <button type="button" onClick={() => void reload()}>{t('review.reload')}</button>
              </p>
            )}
          </div>
        )}
        <footer className="review-actions">
          <button type="button" onClick={onClose}>{t('review.cancel')}</button>
          <button
            type="button"
            className="primary"
            onClick={() => void confirm()}
            disabled={confirmDisabled}
            aria-label={t('review.confirm')}
          >
            <ShieldCheck size={16} />{reviewing ? t('review.reviewing') : t('review.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
