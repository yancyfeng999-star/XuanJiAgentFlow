import { lazy, Suspense, useEffect, useState } from 'react';

import { useT } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { useWorkspaceStore } from '../../store/workspaceStore';
import InspectorResizeHandle from './InspectorResizeHandle';
import InspectorTabs from './InspectorTabs';
import TaskExecutionTab from './TaskExecutionTab';
import TaskOverviewTab from './TaskOverviewTab';
import TaskOutputsTab from './TaskOutputsTab';
import TaskPromptTab from './TaskPromptTab';
import { draftEquals, draftToPatch, taskToDraft, type InspectorTab, type SaveState, type TaskDraft } from './taskDraft';

const TaskRunDetailsTab = lazy(() => import('./TaskRunDetailsTab'));

export default function Inspector() {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const inspectorContext = useWorkspaceStore((state) => state.inspectorContext);
  const frozen = workflow?.status !== 'draft';
  const updateTask = useWorkspaceStore((state) => state.updateTask);
  const setTaskDependencies = useWorkspaceStore((state) => state.setTaskDependencies);
  const createRevision = useWorkspaceStore((state) => state.createRevision);
  const removeTask = useWorkspaceStore((state) => state.removeTask);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const closeInspector = useWorkspaceStore((state) => state.closeInspector);
  const t = useT();
  const { agentTypeLabel } = useLabels();
  const [tab, setTab] = useState<InspectorTab>('prompt_inputs');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('clean');

  const selectedTask = useWorkspaceStore((state) => state.workflow?.tasks.find((item) => item.id === (
    state.inspectorContext?.kind === 'task' ? state.inspectorContext.taskId : state.selectedTaskId
  )) ?? null);

  useEffect(() => {
    if (!selectedTask) {
      setDraft(null);
      setSaveState('clean');
      return;
    }
    setDraft(taskToDraft(selectedTask));
    setSaveState('clean');
  }, [selectedTask]);

  const applyPatch = (patch: Partial<TaskDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setSaveState('dirty');
  };

  const save = async () => {
    if (!selectedTask || !draft || frozen) return;
    setSaveState('saving');
    await setTaskDependencies(selectedTask.id, draft.dependencies);
    const { error } = useWorkspaceStore.getState();
    if (error?.code === 'workflow_cycle') {
      setSaveState('error');
      return;
    }
    const { dependencies: _deps, ...rest } = draftToPatch(draft);
    await updateTask(selectedTask.id, rest);
    setSaveState(useWorkspaceStore.getState().error ? 'error' : 'saved');
  };

  return (
    <aside className="inspector" aria-label={t('inspector.title')}>
      <InspectorResizeHandle />
      <button
        type="button"
        className="inspector-collapse"
        aria-label={t('inspector.close')}
        title={t('inspector.close')}
        onClick={() => closeInspector()}
      >
        ×
      </button>
      {inspectorContext?.kind === 'runs' && !selectedTask ? (
        <Suspense fallback={<div className="inspector-tab-skeleton" />}>
          <TaskRunDetailsTab />
        </Suspense>
      ) : !selectedTask || !draft ? (
        <div className="inspector-empty">
          <h2>{t('inspector.title')}</h2>
          <p>{t('inspector.empty')}</p>
        </div>
      ) : (
        <>
          <div className="inspector-head">
            <span>{agentTypeLabel(selectedTask.agent_type)}</span>
            <h2>{selectedTask.title}</h2>
            <p>{selectedTask.description}</p>
            <span data-save-state={saveState}>{t(`inspector.save.${saveState}`)}</span>
          </div>
          {frozen && (
            <div className="inspector-readonly">
              <p>{t('inspector.readonly')}</p>
              <button type="button" onClick={() => void createRevision()}>{t('inspector.createRevision')}</button>
            </div>
          )}
          <InspectorTabs current={tab} onChange={setTab} />
          {tab === 'overview' && (
            <TaskOverviewTab
              task={selectedTask}
              draft={draft}
              nodes={nodes}
              onGoNodes={() => setActivePanel('nodes')}
            />
          )}
          {tab === 'prompt_inputs' && (
            <TaskPromptTab
              draft={draft}
              tasks={(workflow?.tasks ?? []).filter((item) => item.id !== selectedTask.id)}
              frozen={frozen}
              onChange={applyPatch}
            />
          )}
          {tab === 'execution' && (
            <TaskExecutionTab
              draft={draft}
              frozen={frozen}
              nodes={nodes}
              onChange={applyPatch}
            />
          )}
          {tab === 'outputs' && <TaskOutputsTab draft={draft} frozen={frozen} onChange={applyPatch} />}
          {tab === 'run_details' && (
            <Suspense fallback={<div className="inspector-tab-skeleton" />}>
              <TaskRunDetailsTab />
            </Suspense>
          )}
          {!frozen && (
            <>
              <button type="button" className="form-primary" disabled={saveState === 'saving' || draftEquals(draft, taskToDraft(selectedTask))} onClick={() => void save()}>
                {t('task.save')}
              </button>
              <button type="button" className="danger-link" onClick={() => void removeTask(selectedTask.id)}>
                {t('task.delete')}
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}

