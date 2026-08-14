import { useEffect } from 'react';

import type { HermesNode } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ChoicePicker from './ChoicePicker';
import type { TaskDraft } from './taskDraft';

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

export default function TaskExecutionTab({
  draft,
  frozen,
  nodes,
  onChange,
}: {
  draft: TaskDraft;
  frozen: boolean;
  nodes: HermesNode[];
  onChange: (patch: Partial<TaskDraft>) => void;
}) {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const loadNodes = useWorkspaceStore((state) => state.loadNodes);
  const t = useT();
  const { capabilityLabel } = useLabels();
  const policy = draft.execution_policy;
  const retry = draft.retry_policy;

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const workflowModels = workflow?.tasks.flatMap((item) => item.execution_policy.required_models) ?? [];
  const workflowTools = workflow?.tasks.flatMap((item) => item.execution_policy.required_tools) ?? [];
  const workflowTags = workflow?.tasks.flatMap((item) => item.execution_policy.required_tags) ?? [];
  const modelOptions = unique([...workflowModels, ...nodes.flatMap((node) => nodeCapabilities(node, 'models'))]);
  const toolOptions = unique([...workflowTools, ...nodes.flatMap((node) => nodeCapabilities(node, 'tools'))]);
  const tagOptions = unique([...workflowTags, ...nodes.flatMap((node) => nodeCapabilities(node, 'tags'))]);

  const patchPolicy = (changes: Partial<TaskDraft['execution_policy']>) => {
    const next = { ...policy, ...changes };
    if (next.mode !== 'fixed') next.node_id = null;
    if (next.mode !== 'node_group') next.node_group = null;
    onChange({ execution_policy: next });
  };

  return (
    <div className="inspector-tab-panel">
      <label htmlFor="task-mode">{t('task.field.mode')}</label>
      <select
        id="task-mode"
        value={policy.mode}
        disabled={frozen}
        onChange={(event) => patchPolicy({ mode: event.target.value as typeof policy.mode })}
      >
        <option value="auto">{t('task.mode.auto')}</option>
        <option value="fixed">{t('task.mode.fixed')}</option>
        <option value="node_group">{t('task.mode.nodeGroup')}</option>
        <option value="local_first">{t('task.mode.localFirst')}</option>
        <option value="remote_first">{t('task.mode.remoteFirst')}</option>
      </select>
      {policy.mode === 'fixed' && (
        <>
          <label htmlFor="task-node">{t('task.field.node')}</label>
          <select
            id="task-node"
            value={policy.node_id ?? ''}
            disabled={frozen}
            required
            onChange={(event) => patchPolicy({ node_id: event.target.value || null })}
          >
            <option value="">{t('task.nodePlaceholder')}</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.name}（{node.id}）</option>
            ))}
          </select>
          {nodes.length === 0 && <p className="choice-empty">{t('task.nodeEmpty')}</p>}
        </>
      )}
      {policy.mode === 'node_group' && (
        <>
          <label htmlFor="task-group">{t('task.field.nodeGroup')}</label>
          <select
            id="task-group"
            value={policy.node_group ?? ''}
            disabled={frozen}
            required
            onChange={(event) => patchPolicy({ node_group: event.target.value || null })}
          >
            <option value="">{t('task.nodeGroupPlaceholder')}</option>
            {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          {tagOptions.length === 0 && <p className="choice-empty">{t('task.nodeGroupEmpty')}</p>}
        </>
      )}
      <ChoicePicker
        id="task-models-add"
        label={t('task.models')}
        values={policy.required_models}
        options={modelOptions}
        onChange={(required_models) => patchPolicy({ required_models })}
        disabled={frozen}
        emptyHint={t('task.modelsEmpty')}
        formatChoice={capabilityLabel}
      />
      <ChoicePicker
        id="task-tools-add"
        label={t('task.tools')}
        values={policy.required_tools}
        options={toolOptions}
        onChange={(required_tools) => patchPolicy({ required_tools })}
        disabled={frozen}
        emptyHint={t('task.toolsEmpty')}
        formatChoice={capabilityLabel}
      />
      <ChoicePicker
        id="task-tags-add"
        label={t('task.tags')}
        values={policy.required_tags}
        options={tagOptions}
        onChange={(required_tags) => patchPolicy({ required_tags })}
        disabled={frozen}
        emptyHint={t('task.tagsEmpty')}
        formatChoice={capabilityLabel}
      />
      <label htmlFor="task-timeout">{t('task.field.timeout')}</label>
      <select
        id="task-timeout"
        value={String(policy.timeout_seconds)}
        disabled={frozen}
        onChange={(event) => patchPolicy({ timeout_seconds: Number(event.target.value) })}
      >
        {presetOptions(String(policy.timeout_seconds), NUMBER_PRESETS.timeout).map((value) => (
          <option key={value} value={value}>
            {value < 3600 ? t('task.minutes', { value: value / 60 }) : t('task.hours', { value: value / 3600 })}
          </option>
        ))}
      </select>
      <label htmlFor="task-attempts">{t('task.field.maxAttempts')}</label>
      <select
        id="task-attempts"
        value={String(retry.max_attempts)}
        disabled={frozen}
        onChange={(event) => onChange({ retry_policy: { ...retry, max_attempts: Number(event.target.value) } })}
      >
        {presetOptions(String(retry.max_attempts), NUMBER_PRESETS.attempts).map((value) => (
          <option key={value} value={value}>{t('task.times', { value })}</option>
        ))}
      </select>
      <label htmlFor="task-delay">{t('task.field.retryDelay')}</label>
      <select
        id="task-delay"
        value={String(retry.delay_seconds)}
        disabled={frozen}
        onChange={(event) => onChange({ retry_policy: { ...retry, delay_seconds: Number(event.target.value) } })}
      >
        {presetOptions(String(retry.delay_seconds), NUMBER_PRESETS.delay).map((value) => (
          <option key={value} value={value}>{value === 0 ? t('task.retryNow') : t('task.seconds', { value })}</option>
        ))}
      </select>
    </div>
  );
}
