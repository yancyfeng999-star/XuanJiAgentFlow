import { AlertTriangle, RefreshCw } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { buildReadinessGroups, firstBlockingGroup } from './readinessPresentation';

export default function ReadinessCenter({
  expanded,
  onExpandedChange,
}: {
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useT();
  const readiness = useWorkspaceStore((state) => state.readiness);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const loadReadiness = useWorkspaceStore((state) => state.loadReadiness);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const openTaskInspector = useWorkspaceStore((state) => state.openTaskInspector);
  const detailsOpen = expanded ?? false;
  const setDetailsOpen = onExpandedChange ?? (() => undefined);

  if (!readiness || readiness.ready) return null;

  const groups = buildReadinessGroups(readiness, workflow?.tasks.length ?? 0);
  const first = firstBlockingGroup(groups);
  if (!first) return null;

  const openGroup = (group: typeof groups[number]) => {
    if (group.key === 'task_matching' && group.targetIds[0]) {
      openTaskInspector(group.targetIds[0]);
      return;
    }
    if (group.action === 'open_planner') setActivePanel('thinking_models');
    else if (group.action === 'open_nodes') setActivePanel('nodes');
    else if (group.action === 'open_project') setActivePanel('projects');
    else if (group.action === 'retry') void loadReadiness();
    else setActivePanel('workflow');
  };

  return (
    <section className="readiness-strip-wrap" aria-label={t('readiness.title')}>
      <div className="readiness-strip" data-severity={first.severity}>
        <AlertTriangle size={16} aria-hidden="true" />
        <p>
          <strong>{first.title}</strong>
          <span>{t('readiness.affected', { count: first.count })}</span>
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailsOpen(!detailsOpen)}>
          {detailsOpen ? t('readiness.hideDetails') : t('readiness.viewDetails')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadReadiness()}>
          <RefreshCw size={14} aria-hidden="true" />{t('readiness.recheck')}
        </button>
      </div>
      {detailsOpen && (
        <div className="readiness-overlay" role="dialog" aria-label={t('readiness.details')}>
          <ul className="readiness-groups">
            {groups.map((group) => (
              <li key={group.key} data-severity={group.severity}>
                <div>
                  <strong>{group.title}</strong>
                  <span>{group.message}</span>
                  {group.key === 'task_matching' && group.targetIds.map((targetId) => {
                    const task = workflow?.tasks.find((item) => item.id === targetId);
                    return (
                      <button
                        key={targetId}
                        type="button"
                        className="readiness-task-link"
                        onClick={() => openTaskInspector(targetId)}
                      >
                        {task?.title ?? targetId}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openGroup(group)}
                >
                  {t(`readiness.action.${group.action}`)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
