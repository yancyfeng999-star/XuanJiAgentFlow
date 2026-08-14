import { relativePathError, type TaskDraft } from './taskDraft';
import { useT } from '../../lib/i18n';

export default function TaskOutputsTab({
  draft,
  frozen,
  onChange,
}: {
  draft: TaskDraft;
  frozen: boolean;
  onChange: (patch: Partial<TaskDraft>) => void;
}) {
  const t = useT();
  const pathErrors = draft.expected_outputs
    .map((output) => relativePathError(output.path))
    .filter(Boolean);
  return (
    <div className="inspector-tab-panel">
      <label htmlFor="task-writes">{t('task.writes')}</label>
      <textarea
        id="task-writes"
        disabled={frozen}
        value={draft.writes.join('\n')}
        onChange={(event) => onChange({ writes: event.target.value.split('\n') })}
      />
      <label htmlFor="task-done">{t('task.doneDefinition')}</label>
      <textarea
        id="task-done"
        disabled={frozen}
        value={draft.done_definition.join('\n')}
        onChange={(event) => onChange({ done_definition: event.target.value.split('\n') })}
      />
      <label htmlFor="task-run-gate">{t('task.runGate')}</label>
      <select
        id="task-run-gate"
        disabled={frozen}
        value={draft.run_gate}
        onChange={(event) => onChange({ run_gate: event.target.value as TaskDraft['run_gate'] })}
      >
        <option value="auto">{t('task.runGateAuto')}</option>
        <option value="review_before_start">{t('task.runGateBeforeStart')}</option>
        <option value="review_before_complete">{t('task.runGateBeforeComplete')}</option>
      </select>
      {pathErrors.length > 0 && <p role="alert">{t('inspector.pathError')}</p>}
    </div>
  );
}
