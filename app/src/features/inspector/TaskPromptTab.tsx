import type { WorkflowTask } from '../../lib/client';
import { useT } from '../../lib/i18n';
import type { TaskDraft } from './taskDraft';

export default function TaskPromptTab({
  draft,
  tasks,
  frozen,
  onChange,
}: {
  draft: TaskDraft;
  tasks: WorkflowTask[];
  frozen: boolean;
  onChange: (patch: Partial<TaskDraft>) => void;
}) {
  const t = useT();
  return (
    <div className="inspector-tab-panel">
      <label htmlFor="task-title">{t('task.field.title')}</label>
      <input
        id="task-title"
        value={draft.title}
        disabled={frozen}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <label htmlFor="task-description">{t('task.field.description')}</label>
      <textarea
        id="task-description"
        value={draft.description}
        disabled={frozen}
        onChange={(event) => onChange({ description: event.target.value })}
      />
      <label htmlFor="task-agent">{t('task.field.agentType')}</label>
      <input
        id="task-agent"
        value={draft.agent_type}
        disabled={frozen}
        onChange={(event) => onChange({ agent_type: event.target.value })}
      />
      <label htmlFor="task-prompt">{t('task.field.prompt')}</label>
      <textarea
        id="task-prompt"
        aria-label={t('task.field.prompt')}
        value={draft.prompt}
        disabled={frozen}
        onChange={(event) => onChange({ prompt: event.target.value })}
      />
      <fieldset disabled={frozen}>
        <legend>{t('task.field.dependencies')}</legend>
        {tasks.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={draft.dependencies.includes(item.id)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...draft.dependencies, item.id]
                  : draft.dependencies.filter((id) => id !== item.id);
                onChange({ dependencies: next });
              }}
            />
            {item.title}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
