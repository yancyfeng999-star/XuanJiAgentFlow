import { create } from 'zustand';
import type { HermesNode, Project, Run, RunStatus, Workflow } from '../domain/types';

interface WorkspaceState {
  project: Project; workflow: Workflow; run: Run; hermesNodes: HermesNode[]; selectedTaskId: string | null;
  selectTask: (taskId: string | null) => void; setRunStatus: (status: RunStatus) => void;
  setRunProgress: (progress: number) => void; resetWorkspace: () => void;
}
const now = '2026-07-27T00:00:00Z';
export const initialWorkspace = {
  project: { id: 'project-xuanji', name: '璇玑 2.0 产品调研', rootPath: '~/XuanjiProjects/project-xuanji', activeWorkflowVersion: 2, createdAt: now, updatedAt: now },
  workflow: { id: 'workflow-v2', projectId: 'project-xuanji', version: 2, goal: '形成璇玑 2.0 市场与技术方案', plannerProvider: 'DeepSeek', plannerModel: 'deepseek-reasoner', status: 'draft' as const, tasks: [
    { id: 'task-market', workflowId: 'workflow-v2', title: '市场规模调研', description: '分析目标市场规模与趋势。', prompt: '调研目标市场的规模、增长率与主要驱动因素。', agentType: 'research' as const, dependencies: [], executionPolicy: { nodePreference: 'auto' as const, requiredTags: ['research'], timeoutSeconds: 1800 }, retryPolicy: { maxAttempts: 3, backoffSeconds: 30 }, expectedOutputs: ['market-size.md'], uiPosition: { x: 100, y: 140 } },
    { id: 'task-architecture', workflowId: 'workflow-v2', title: '技术架构评估', description: '评估本地协调器与远程节点架构。', prompt: '评估系统架构、风险与实施路径。', agentType: 'code' as const, dependencies: ['task-market'], executionPolicy: { nodePreference: 'local' as const, requiredTags: ['code'], timeoutSeconds: 2400 }, retryPolicy: { maxAttempts: 2, backoffSeconds: 60 }, expectedOutputs: ['architecture.md'], uiPosition: { x: 470, y: 140 } },
    { id: 'task-summary', workflowId: 'workflow-v2', title: '最终方案汇总', description: '汇总研究与架构结论。', prompt: '基于所有上游产出形成最终交付方案。', agentType: 'business' as const, dependencies: ['task-architecture'], executionPolicy: { nodePreference: 'auto' as const, requiredTags: [], timeoutSeconds: 1200 }, retryPolicy: { maxAttempts: 2, backoffSeconds: 30 }, expectedOutputs: ['final-report.md'], uiPosition: { x: 840, y: 140 } },
  ]},
  run: { id: 'run-preview', workflowId: 'workflow-v2', status: 'idle' as const, progress: 0, attempts: {} },
  hermesNodes: [{ id: 'node-local', name: '本机 Hermes', kind: 'local' as const, status: 'online' as const, maxConcurrency: 4, runningTasks: 0 }], selectedTaskId: null,
};
export const useWorkspaceStore = create<WorkspaceState>((set) => ({ ...initialWorkspace,
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  setRunStatus: (status) => set((state) => ({ run: { ...state.run, status } })),
  setRunProgress: (progress) => set((state) => ({ run: { ...state.run, progress: Math.max(0, Math.min(100, progress)) } })),
  resetWorkspace: () => set({ ...initialWorkspace, run: { ...initialWorkspace.run, attempts: {} }, selectedTaskId: null }),
}));
