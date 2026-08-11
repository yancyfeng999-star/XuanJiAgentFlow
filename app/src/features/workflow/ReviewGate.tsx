import { ShieldCheck } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ReviewGate() {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const loading = useWorkspaceStore((state) => state.loading);
  const reviewWorkflow = useWorkspaceStore((state) => state.reviewWorkflow);
  const t = useT();

  if (!workflow) return <span className="review-state">{t('review.planFirst')}</span>;
  if (workflow.status === 'reviewed') return <span className="review-state reviewed"><ShieldCheck size={14} />{t('review.frozen')}</span>;

  return <button type="button" onClick={() => void reviewWorkflow()} disabled={loading} aria-label={t('review.action')}><ShieldCheck size={16} />{t('review.action')}</button>;
}
