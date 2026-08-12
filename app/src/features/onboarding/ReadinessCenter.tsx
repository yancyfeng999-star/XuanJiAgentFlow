import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, XCircle } from 'lucide-react';

import { useT } from '../../lib/i18n';
import type { ReadinessAction, ReadinessCheckStatus } from '../../lib/client';
import { useWorkspaceStore } from '../../store/workspaceStore';

const CHECK_KEYS = ['project', 'planner', 'workflow', 'tasks', 'nodes', 'credentials'] as const;

function CheckIcon({ status }: { status: ReadinessCheckStatus }) {
  switch (status) {
    case 'ready':
      return <CheckCircle2 size={16} aria-hidden="true" className="readiness-icon ready" />;
    case 'blocked':
      return <XCircle size={16} aria-hidden="true" className="readiness-icon blocked" />;
    case 'warning':
      return <AlertTriangle size={16} aria-hidden="true" className="readiness-icon warning" />;
    default:
      return <CircleHelp size={16} aria-hidden="true" className="readiness-icon unknown" />;
  }
}

export default function ReadinessCenter() {
  const t = useT();
  const readiness = useWorkspaceStore((state) => state.readiness);
  const loadReadiness = useWorkspaceStore((state) => state.loadReadiness);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);

  const runAction = (action: ReadinessAction) => {
    switch (action) {
      case 'open_planner':
        setActivePanel('settings');
        break;
      case 'open_nodes':
        setActivePanel('nodes');
        break;
      case 'open_project':
      case 'open_workflow':
        setActivePanel('workflow');
        break;
      case 'retry':
        void loadReadiness();
        break;
    }
  };

  if (!readiness) {
    return (
      <section className="readiness-center" aria-label={t('readiness.title')}>
        <div className="readiness-head">
          <h2>{t('readiness.title')}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadReadiness()}>
            <RefreshCw size={14} aria-hidden="true" />{t('readiness.check')}
          </button>
        </div>
        <p className="muted">{t('readiness.unchecked')}</p>
      </section>
    );
  }

  return (
    <section className="readiness-center" aria-label={t('readiness.title')}>
      <div className="readiness-head">
        <h2>{t('readiness.title')}</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadReadiness()}>
          <RefreshCw size={14} aria-hidden="true" />{t('readiness.recheck')}
        </button>
      </div>
      <ul className="readiness-checks">
        {CHECK_KEYS.map((key) => {
          const status = readiness.checks[key] ?? 'unknown';
          return (
            <li key={key} data-status={status}>
              <CheckIcon status={status} />
              <span>{t(`readiness.check.${key}`)}</span>
              <span className="readiness-status">{t(`readiness.status.${status}`)}</span>
            </li>
          );
        })}
      </ul>
      {readiness.ready ? (
        <p className="readiness-ok" role="status">{t('readiness.allReady')}</p>
      ) : (
        <ul className="readiness-issues">
          {readiness.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.targetId ?? index}`} data-severity={issue.severity}>
              <div className="readiness-issue-text">
                <strong>{issue.title}</strong>
                <span>{issue.message}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => runAction(issue.action)}
              >
                {t(`readiness.action.${issue.action}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
