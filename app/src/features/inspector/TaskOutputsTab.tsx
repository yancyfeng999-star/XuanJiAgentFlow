import { Plus, Trash2 } from 'lucide-react';

import type { ExpectedOutput, VerifyStep } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { relativePathError, type TaskDraft } from './taskDraft';

const MEDIA_TYPES = [
  '',
  'text/markdown',
  'application/json',
  'text/plain',
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/octet-stream',
];

function outputMediaTypes(output: ExpectedOutput): string[] {
  return output.media_type && !MEDIA_TYPES.includes(output.media_type)
    ? [...MEDIA_TYPES, output.media_type]
    : MEDIA_TYPES;
}

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
  const { mediaTypeLabel } = useLabels();
  const pathErrors = draft.expected_outputs
    .map((output) => relativePathError(output.path))
    .filter(Boolean);

  const updateOutput = (index: number, changes: Partial<ExpectedOutput>) => {
    onChange({
      expected_outputs: draft.expected_outputs.map((output, outputIndex) => (
        outputIndex === index ? { ...output, ...changes } : output
      )),
    });
  };

  const updateVerify = (index: number, changes: Partial<VerifyStep>) => {
    onChange({
      verify: draft.verify.map((step, stepIndex) => (
        stepIndex === index ? { ...step, ...changes } : step
      )),
    });
  };

  return (
    <div className="inspector-tab-panel">
      <fieldset className="output-field" disabled={frozen}>
        <legend>{t('task.outputs')}</legend>
        {draft.expected_outputs.length === 0 && <p className="choice-empty">{t('task.outputsEmpty')}</p>}
        {draft.expected_outputs.map((output, index) => (
          <div className="output-row" key={index}>
            <label>
              <span>{t('task.outputPath')}</span>
              <input
                value={output.path}
                placeholder={t('task.outputPathPlaceholder')}
                onChange={(event) => updateOutput(index, { path: event.target.value })}
              />
            </label>
            <label>
              <span>{t('task.outputType')}</span>
              <select
                value={output.media_type ?? ''}
                onChange={(event) => updateOutput(index, { media_type: event.target.value || null })}
              >
                {outputMediaTypes(output).map((mediaType) => (
                  <option key={mediaType || 'auto'} value={mediaType}>{mediaTypeLabel(mediaType)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => onChange({
                expected_outputs: draft.expected_outputs.filter((_, outputIndex) => outputIndex !== index),
              })}
              aria-label={t('task.deleteOutput', { name: output.path || index + 1 })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!frozen && (
          <button
            type="button"
            className="add-output"
            onClick={() => onChange({
              expected_outputs: [...draft.expected_outputs, { path: '', media_type: null }],
            })}
          >
            <Plus size={14} />{t('task.addOutput')}
          </button>
        )}
      </fieldset>
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
      <fieldset className="output-field" disabled={frozen}>
        <legend>{t('task.verify')}</legend>
        {draft.verify.map((step, index) => (
          <div className="output-row" key={index}>
            <label>
              <span>{t('task.verifyKind')}</span>
              <select
                value={step.kind}
                onChange={(event) => updateVerify(index, { kind: event.target.value as VerifyStep['kind'] })}
              >
                <option value="command">{t('task.verifyCommand')}</option>
                <option value="file_exists">{t('task.verifyFile')}</option>
                <option value="sha256">{t('task.verifySha')}</option>
                <option value="manual">{t('task.verifyManual')}</option>
              </select>
            </label>
            <label>
              <span>{t('task.verifyValue')}</span>
              <input
                value={step.value}
                onChange={(event) => updateVerify(index, { value: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => onChange({ verify: draft.verify.filter((_, stepIndex) => stepIndex !== index) })}
              aria-label={t('task.deleteVerify', { name: index + 1 })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!frozen && (
          <button
            type="button"
            className="add-output"
            onClick={() => onChange({
              verify: [...draft.verify, { kind: 'file_exists', value: '' }],
            })}
          >
            <Plus size={14} />{t('task.addVerify')}
          </button>
        )}
      </fieldset>
      {pathErrors.length > 0 && <p role="alert">{t('inspector.pathError')}</p>}
    </div>
  );
}
