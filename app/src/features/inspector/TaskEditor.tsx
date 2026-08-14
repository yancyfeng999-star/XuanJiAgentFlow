import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { ExpectedOutput, HermesNode, VerifyStep, WorkflowTask } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ChoicePicker from './ChoicePicker';

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

const NUMBER_PRESETS = {
  timeout: [300, 900, 1800, 3600, 7200],
  attempts: [1, 2, 3, 5],
  delay: [0, 1, 5, 10, 30],
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nodeCapabilities(node: HermesNode, key: 'models' | 'tools' | 'tags'): string[] {
  const direct = strings(node.capabilities_json[key]);
  const nested = node.capabilities_json.hermes_capabilities;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return direct;
  return [...direct, ...strings((nested as Record<string, unknown>)[key])];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function presetOptions(current: string, presets: number[]): number[] {
  const value = Number(current);
  return [...new Set([...presets, ...(Number.isFinite(value) ? [value] : [])])].sort((left, right) => left - right);
}

function outputMediaTypes(output: ExpectedOutput): string[] {
  return output.media_type && !MEDIA_TYPES.includes(output.media_type)
    ? [...MEDIA_TYPES, output.media_type]
    : MEDIA_TYPES;
}

export default function TaskEditor({ task, hideActions = false }: { task: WorkflowTask; hideActions?: boolean }) {
  const frozen = useWorkspaceStore((state) => state.workflow?.status !== 'draft');
  const workflow = useWorkspaceStore((state) => state.workflow);
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const loadNodes = useWorkspaceStore((state) => state.loadNodes);
  const updateTask = useWorkspaceStore((state) => state.updateTask);
  const removeTask = useWorkspaceStore((state) => state.removeTask);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [prompt, setPrompt] = useState(task.prompt);
  const [mode, setMode] = useState(task.execution_policy.mode);
  const [nodeId, setNodeId] = useState(task.execution_policy.node_id ?? '');
  const [nodeGroup, setNodeGroup] = useState(task.execution_policy.node_group ?? '');
  const [models, setModels] = useState(task.execution_policy.required_models);
  const [tools, setTools] = useState(task.execution_policy.required_tools);
  const [tags, setTags] = useState(task.execution_policy.required_tags);
  const [timeout, setTimeout] = useState(String(task.execution_policy.timeout_seconds));
  const [attempts, setAttempts] = useState(String(task.retry_policy.max_attempts));
  const [delay, setDelay] = useState(String(task.retry_policy.delay_seconds));
  const [outputs, setOutputs] = useState(task.expected_outputs);
  const [writes, setWrites] = useState(task.writes.join('\n'));
  const [doneDefinition, setDoneDefinition] = useState(task.done_definition.join('\n'));
  const [verifySteps, setVerifySteps] = useState<VerifyStep[]>(task.verify);
  const [runGate, setRunGate] = useState(task.run_gate);
  const t = useT();
  const { capabilityLabel, mediaTypeLabel } = useLabels();

  useEffect(() => { void loadNodes(); }, [loadNodes]);
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPrompt(task.prompt);
    setMode(task.execution_policy.mode);
    setNodeId(task.execution_policy.node_id ?? '');
    setNodeGroup(task.execution_policy.node_group ?? '');
    setModels(task.execution_policy.required_models);
    setTools(task.execution_policy.required_tools);
    setTags(task.execution_policy.required_tags);
    setTimeout(String(task.execution_policy.timeout_seconds));
    setAttempts(String(task.retry_policy.max_attempts));
    setDelay(String(task.retry_policy.delay_seconds));
    setOutputs(task.expected_outputs);
    setWrites(task.writes.join('\n'));
    setDoneDefinition(task.done_definition.join('\n'));
    setVerifySteps(task.verify);
    setRunGate(task.run_gate);
  }, [task]);

  const workflowModels = workflow?.tasks.flatMap((item) => item.execution_policy.required_models) ?? [];
  const workflowTools = workflow?.tasks.flatMap((item) => item.execution_policy.required_tools) ?? [];
  const workflowTags = workflow?.tasks.flatMap((item) => item.execution_policy.required_tags) ?? [];
  const modelOptions = unique([...workflowModels, ...nodes.flatMap((node) => nodeCapabilities(node, 'models'))]);
  const toolOptions = unique([...workflowTools, ...nodes.flatMap((node) => nodeCapabilities(node, 'tools'))]);
  const tagOptions = unique([...workflowTags, ...nodes.flatMap((node) => nodeCapabilities(node, 'tags'))]);

  const updateOutput = (index: number, changes: Partial<ExpectedOutput>) => {
    setOutputs(outputs.map((output, outputIndex) => outputIndex === index ? { ...output, ...changes } : output));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void updateTask(task.id, {
      title,
      description,
      prompt,
      execution_policy: {
        mode,
        node_id: mode === 'fixed' ? nodeId || null : null,
        node_group: mode === 'node_group' ? nodeGroup || null : null,
        required_models: models,
        required_tools: tools,
        required_tags: tags,
        timeout_seconds: Number(timeout),
      },
      retry_policy: { max_attempts: Number(attempts), delay_seconds: Number(delay) },
      expected_outputs: outputs
        .map((output) => ({ path: output.path.trim(), media_type: output.media_type || null }))
        .filter((output) => output.path),
      writes: writes.split('\n').map((line) => line.trim()).filter(Boolean),
      done_definition: doneDefinition.split('\n').map((line) => line.trim()).filter(Boolean),
      verify: verifySteps.filter((step) => step.value.trim()),
      run_gate: runGate,
    });
  };

  return (
    <form className="task-editor" onSubmit={submit}>
      <label htmlFor="task-title">{t('task.field.title')}</label>
      <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={frozen} />
      <label htmlFor="task-description">{t('task.field.description')}</label>
      <textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={frozen} />
      <label htmlFor="task-prompt">{t('task.field.prompt')}</label>
      <textarea id="task-prompt" aria-label={t('task.field.prompt')} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={frozen} />
      <label htmlFor="task-mode">{t('task.field.mode')}</label>
      <select id="task-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} disabled={frozen}>
        <option value="auto">{t('task.mode.auto')}</option><option value="fixed">{t('task.mode.fixed')}</option><option value="node_group">{t('task.mode.nodeGroup')}</option>
        <option value="local_first">{t('task.mode.localFirst')}</option><option value="remote_first">{t('task.mode.remoteFirst')}</option>
      </select>
      {mode === 'fixed' && (
        <>
          <label htmlFor="task-node">{t('task.field.node')}</label>
          <select id="task-node" value={nodeId} onChange={(event) => setNodeId(event.target.value)} disabled={frozen} required>
            <option value="">{t('task.nodePlaceholder')}</option>
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}（{node.id}）</option>)}
          </select>
          {nodes.length === 0 && <p className="choice-empty">{t('task.nodeEmpty')}</p>}
        </>
      )}
      {mode === 'node_group' && (
        <>
          <label htmlFor="task-group">{t('task.field.nodeGroup')}</label>
          <select id="task-group" value={nodeGroup} onChange={(event) => setNodeGroup(event.target.value)} disabled={frozen} required>
            <option value="">{t('task.nodeGroupPlaceholder')}</option>
            {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          {tagOptions.length === 0 && <p className="choice-empty">{t('task.nodeGroupEmpty')}</p>}
        </>
      )}
      <ChoicePicker id="task-models-add" label={t('task.models')} values={models} options={modelOptions} onChange={setModels} disabled={frozen} emptyHint={t('task.modelsEmpty')} formatChoice={capabilityLabel} />
      <ChoicePicker id="task-tools-add" label={t('task.tools')} values={tools} options={toolOptions} onChange={setTools} disabled={frozen} emptyHint={t('task.toolsEmpty')} formatChoice={capabilityLabel} />
      <ChoicePicker id="task-tags-add" label={t('task.tags')} values={tags} options={tagOptions} onChange={setTags} disabled={frozen} emptyHint={t('task.tagsEmpty')} formatChoice={capabilityLabel} />
      <label htmlFor="task-timeout">{t('task.field.timeout')}</label>
      <select id="task-timeout" value={timeout} onChange={(event) => setTimeout(event.target.value)} disabled={frozen}>
        {presetOptions(timeout, NUMBER_PRESETS.timeout).map((value) => <option key={value} value={value}>{value < 3600 ? t('task.minutes', { value: value / 60 }) : t('task.hours', { value: value / 3600 })}</option>)}
      </select>
      <label htmlFor="task-attempts">{t('task.field.maxAttempts')}</label>
      <select id="task-attempts" value={attempts} onChange={(event) => setAttempts(event.target.value)} disabled={frozen}>
        {presetOptions(attempts, NUMBER_PRESETS.attempts).map((value) => <option key={value} value={value}>{t('task.times', { value })}</option>)}
      </select>
      <label htmlFor="task-delay">{t('task.field.retryDelay')}</label>
      <select id="task-delay" value={delay} onChange={(event) => setDelay(event.target.value)} disabled={frozen}>
        {presetOptions(delay, NUMBER_PRESETS.delay).map((value) => <option key={value} value={value}>{value === 0 ? t('task.retryNow') : t('task.seconds', { value })}</option>)}
      </select>
      <fieldset className="output-field" disabled={frozen}>
        <legend>{t('task.outputs')}</legend>
        {outputs.length === 0 && <p className="choice-empty">{t('task.outputsEmpty')}</p>}
        {outputs.map((output, index) => (
          <div className="output-row" key={index}>
            <label>
              <span>{t('task.outputPath')}</span>
              <input value={output.path} onChange={(event) => updateOutput(index, { path: event.target.value })} placeholder={t('task.outputPathPlaceholder')} />
            </label>
            <label>
              <span>{t('task.outputType')}</span>
              <select value={output.media_type ?? ''} onChange={(event) => updateOutput(index, { media_type: event.target.value || null })}>
                {outputMediaTypes(output).map((mediaType) => <option key={mediaType || 'auto'} value={mediaType}>{mediaTypeLabel(mediaType)}</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" onClick={() => setOutputs(outputs.filter((_, outputIndex) => outputIndex !== index))} aria-label={t('task.deleteOutput', { name: output.path || index + 1 })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!frozen && <button type="button" className="add-output" onClick={() => setOutputs([...outputs, { path: '', media_type: null }])}><Plus size={14} />{t('task.addOutput')}</button>}
      </fieldset>
      <fieldset className="output-field" disabled={frozen}>
        <legend>{t('task.contract')}</legend>
        <label htmlFor="task-writes">{t('task.writes')}</label>
        <textarea id="task-writes" value={writes} onChange={(event) => setWrites(event.target.value)} placeholder={t('task.writesPlaceholder')} rows={2} />
        <label htmlFor="task-done">{t('task.doneDefinition')}</label>
        <textarea id="task-done" value={doneDefinition} onChange={(event) => setDoneDefinition(event.target.value)} placeholder={t('task.donePlaceholder')} rows={2} />
        <label htmlFor="task-run-gate">{t('task.runGate')}</label>
        <select id="task-run-gate" value={runGate} onChange={(event) => setRunGate(event.target.value as typeof runGate)}>
          <option value="auto">{t('task.runGateAuto')}</option>
          <option value="review_before_start">{t('task.runGateBeforeStart')}</option>
          <option value="review_before_complete">{t('task.runGateBeforeComplete')}</option>
        </select>
        <label>{t('task.verify')}</label>
        {verifySteps.map((step, index) => (
          <div className="output-row" key={index}>
            <label>
              <span>{t('task.verifyKind')}</span>
              <select
                value={step.kind}
                onChange={(event) => setVerifySteps(verifySteps.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, kind: event.target.value as VerifyStep['kind'] } : item))}
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
                onChange={(event) => setVerifySteps(verifySteps.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, value: event.target.value } : item))}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => setVerifySteps(verifySteps.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={t('task.deleteVerify', { name: index + 1 })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!frozen && (
          <button type="button" className="add-output" onClick={() => setVerifySteps([...verifySteps, { kind: 'file_exists', value: '' }])}>
            <Plus size={14} />{t('task.addVerify')}
          </button>
        )}
      </fieldset>
      {!hideActions && <button type="submit" className="form-primary" disabled={frozen}>{t('task.save')}</button>}
      {!hideActions && !frozen && <button type="button" className="danger-link" onClick={() => void removeTask(task.id)}>{t('task.delete')}</button>}
    </form>
  );
}
