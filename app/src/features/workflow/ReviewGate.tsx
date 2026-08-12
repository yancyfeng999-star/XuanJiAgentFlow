import { ShieldCheck } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ReviewGate() {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const reviewing = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'review'));
  const reviewWorkflow = useWorkspaceStore((state) => state.reviewWorkflow);
  const t = useT();

  if (!workflow) return <span className="review-state">{t('review.planFirst')}</span>;
  if (workflow.status === 'reviewed') return <span className="review-state reviewed"><ShieldCheck size={14} />{t('review.frozen')}</span>;

  return (
    <button
      type="button"
      onClick={() => void reviewWorkflow()}
      disabled={reviewing}
      aria-label={t('review.action')}
    >
      <ShieldCheck size={16} />{reviewing ? t('review.reviewing') : t('review.action')}
    </button>
  );
}
