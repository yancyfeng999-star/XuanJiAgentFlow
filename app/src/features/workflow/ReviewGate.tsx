import { ShieldCheck } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ReviewGate() {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const loading = useWorkspaceStore((state) => state.loading);
  const reviewWorkflow = useWorkspaceStore((state) => state.reviewWorkflow);

  if (!workflow) return <span className="review-state">先规划工作流</span>;
  if (workflow.status === 'reviewed') return <span className="review-state reviewed"><ShieldCheck size={14} />已审核，编辑已冻结</span>;

  return <button type="button" onClick={() => void reviewWorkflow()} disabled={loading} aria-label="审核工作流"><ShieldCheck size={16} />审核工作流</button>;
}
