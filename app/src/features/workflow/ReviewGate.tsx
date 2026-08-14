import { useState } from 'react';
import { GitBranchPlus, ShieldCheck } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ReviewWorkspace from './ReviewWorkspace';

export default function ReviewGate() {
  const workflow = useWorkspaceStore((state) => state.workflow);
  const createRevision = useWorkspaceStore((state) => state.createRevision);
  const [open, setOpen] = useState(false);
  const t = useT();

  if (!workflow) return <span className="review-state">{t('review.planFirst')}</span>;
  if (workflow.status === 'reviewed') {
    return (
      <span className="review-state-group">
        <span className="review-state reviewed"><ShieldCheck size={14} />{t('review.frozen')}</span>
        <button
          type="button"
          className="revision-button"
          onClick={() => void createRevision()}
          aria-label={t('review.createRevision')}
        >
          <GitBranchPlus size={14} />{t('review.createRevision')}
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('review.action')}
        aria-haspopup="dialog"
      >
        <ShieldCheck size={16} />{t('review.action')}
      </button>
      {open && <ReviewWorkspace onClose={() => setOpen(false)} />}
    </>
  );
}
