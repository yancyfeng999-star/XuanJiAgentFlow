import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ReactFlowProvider } from '@xyflow/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../lib/i18n';
import { TaskNode } from '../nodes/TaskNode';
import type { WorkflowTask } from '../../../lib/client';

afterEach(cleanup);

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../app/AppShell.css'),
  'utf8',
);

const task: WorkflowTask = {
  id: 'card-1',
  workflow_id: 'wf',
  title: '市场调研',
  description: '收集公开市场规模数据。',
  prompt: '完整 Prompt 不应出现在卡片上',
  agent_type: 'research',
  dependencies: ['up-1'],
  execution_policy: {
    mode: 'auto',
    node_id: null,
    node_group: null,
    required_models: [],
    required_tools: ['web'],
    required_tags: [],
    timeout_seconds: 1800,
  },
  retry_policy: { max_attempts: 3, delay_seconds: 1 },
  expected_outputs: [{ path: 'out.md', media_type: 'text/markdown' }],
  writes: [],
  done_definition: [],
  verify: [],
  run_gate: 'auto',
  ui_position: { x: 0, y: 0 },
};

describe('TaskNode visual contract', () => {
  it('shows compact identity fields and hides the prompt', () => {
    render(
      <I18nProvider>
        <ReactFlowProvider>
          <TaskNode
            id="card-1"
            data={task}
            selected={false}
            type="task"
            dragging={false}
            zIndex={1}
            isConnectable
            positionAbsoluteX={0}
            positionAbsoluteY={0}
          />
        </ReactFlowProvider>
      </I18nProvider>,
    );
    expect(screen.getByText('市场调研')).toBeInTheDocument();
    expect(screen.getByText(/调研|research/i)).toBeInTheDocument();
    expect(screen.getByText('收集公开市场规模数据。')).toBeInTheDocument();
    expect(screen.queryByText('完整 Prompt 不应出现在卡片上')).not.toBeInTheDocument();
    expect(screen.queryByText('web')).not.toBeInTheDocument();
  });

  it('does not apply transform, scale, filter, or opacity animation on hover or selected text', () => {
    const hover = css.match(/\.task-node:hover\s*\{[^}]+\}/)?.[0] ?? '';
    const selected = css.match(/\.task-node\.is-selected\s*\{[^}]+\}/)?.[0] ?? '';
    const textSelected = css.match(/\.task-node\.is-selected[^{]*\{[^}]+\}/g)?.join('\n') ?? '';
    for (const block of [hover, selected, textSelected]) {
      expect(block).not.toMatch(/\btransform\s*:/);
      expect(block).not.toMatch(/\bscale\s*\(/);
      expect(block).not.toMatch(/\bfilter\s*:/);
      expect(block).not.toMatch(/translateZ/);
      expect(block).not.toMatch(/opacity\s+[0-9.]+s/);
    }
    expect(css).not.toMatch(/\.task-node:hover[^{]*\{[^}]*transform/);
  });
});
