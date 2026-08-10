import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { ExpectedOutput, HermesNode, WorkflowTask } from '../../lib/client';
import { capabilityLabel, mediaTypeLabel } from '../../lib/labels';
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

export default function TaskEditor({ task }: { task: WorkflowTask }) {
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
    });
  };

  return (
    <form className="task-editor" onSubmit={submit}>
      <label htmlFor="task-title">任务标题</label>
      <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={frozen} />
      <label htmlFor="task-description">任务描述</label>
      <textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={frozen} />
      <label htmlFor="task-prompt">任务指令</label>
      <textarea id="task-prompt" aria-label="任务指令" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={frozen} />
      <label htmlFor="task-mode">调度模式</label>
      <select id="task-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} disabled={frozen}>
        <option value="auto">自动</option><option value="fixed">固定节点</option><option value="node_group">节点组</option>
        <option value="local_first">本地优先</option><option value="remote_first">远程优先</option>
      </select>
      {mode === 'fixed' && (
        <>
          <label htmlFor="task-node">固定节点</label>
          <select id="task-node" value={nodeId} onChange={(event) => setNodeId(event.target.value)} disabled={frozen} required>
            <option value="">请选择节点</option>
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}（{node.id}）</option>)}
          </select>
          {nodes.length === 0 && <p className="choice-empty">请先在“执行节点”中添加并诊断节点。</p>}
        </>
      )}
      {mode === 'node_group' && (
        <>
          <label htmlFor="task-group">节点组</label>
          <select id="task-group" value={nodeGroup} onChange={(event) => setNodeGroup(event.target.value)} disabled={frozen} required>
            <option value="">请选择节点组</option>
            {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          {tagOptions.length === 0 && <p className="choice-empty">节点组来自节点标签，请先完成节点诊断。</p>}
        </>
      )}
      <ChoicePicker id="task-models-add" label="所需模型" values={models} options={modelOptions} onChange={setModels} disabled={frozen} emptyHint="暂无可选模型；完成节点诊断后会自动出现。" formatChoice={capabilityLabel} />
      <ChoicePicker id="task-tools-add" label="所需工具" values={tools} options={toolOptions} onChange={setTools} disabled={frozen} emptyHint="暂无可选工具；完成节点诊断后会自动出现。" formatChoice={capabilityLabel} />
      <ChoicePicker id="task-tags-add" label="所需标签" values={tags} options={tagOptions} onChange={setTags} disabled={frozen} emptyHint="暂无可选标签；完成节点诊断后会自动出现。" formatChoice={capabilityLabel} />
      <label htmlFor="task-timeout">超时（秒）</label>
      <select id="task-timeout" value={timeout} onChange={(event) => setTimeout(event.target.value)} disabled={frozen}>
        {presetOptions(timeout, NUMBER_PRESETS.timeout).map((value) => <option key={value} value={value}>{value < 3600 ? `${value / 60} 分钟` : `${value / 3600} 小时`}</option>)}
      </select>
      <label htmlFor="task-attempts">最大尝试次数</label>
      <select id="task-attempts" value={attempts} onChange={(event) => setAttempts(event.target.value)} disabled={frozen}>
        {presetOptions(attempts, NUMBER_PRESETS.attempts).map((value) => <option key={value} value={value}>{value} 次</option>)}
      </select>
      <label htmlFor="task-delay">重试延迟（秒）</label>
      <select id="task-delay" value={delay} onChange={(event) => setDelay(event.target.value)} disabled={frozen}>
        {presetOptions(delay, NUMBER_PRESETS.delay).map((value) => <option key={value} value={value}>{value === 0 ? '立即重试' : `${value} 秒`}</option>)}
      </select>
      <fieldset className="output-field" disabled={frozen}>
        <legend>预期产出</legend>
        {outputs.length === 0 && <p className="choice-empty">尚未添加预期产出。</p>}
        {outputs.map((output, index) => (
          <div className="output-row" key={index}>
            <label>
              <span>文件路径</span>
              <input value={output.path} onChange={(event) => updateOutput(index, { path: event.target.value })} placeholder="例如 报告.md" />
            </label>
            <label>
              <span>文件类型</span>
              <select value={output.media_type ?? ''} onChange={(event) => updateOutput(index, { media_type: event.target.value || null })}>
                {outputMediaTypes(output).map((mediaType) => <option key={mediaType || 'auto'} value={mediaType}>{mediaTypeLabel(mediaType)}</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" onClick={() => setOutputs(outputs.filter((_, outputIndex) => outputIndex !== index))} aria-label={`删除产出 ${output.path || index + 1}`}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!frozen && <button type="button" className="add-output" onClick={() => setOutputs([...outputs, { path: '', media_type: null }])}><Plus size={14} />添加产出</button>}
      </fieldset>
      <button type="submit" className="form-primary" disabled={frozen}>保存任务</button>
      {!frozen && <button type="button" className="danger-link" onClick={() => void removeTask(task.id)}>删除任务</button>}
    </form>
  );
}
