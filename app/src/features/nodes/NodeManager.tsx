import { useEffect, useState } from 'react';
import { Fingerprint, RefreshCw, Server, Trash2 } from 'lucide-react';

import type { DiagnoseStep, HostKeyInfo } from '../../lib/client';
import { CoordinatorError } from '../../lib/client';
import { useI18n } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { getWorkspaceClient, useWorkspaceStore } from '../../store/workspaceStore';
import NodeSetupWizard from './NodeSetupWizard';
import ProvisionWizard from './ProvisionWizard';

function DiagnoseSteps({ steps }: { steps: DiagnoseStep[] }) {
  const { t } = useI18n();
  return (
    <ol className="diagnose-steps">
      {steps.map((step) => (
        <li key={step.step} data-status={step.status}>
          <strong>{t(`nodes.step.${step.step}`)}</strong>
          <span>{t(`nodes.stepStatus.${step.status}`)}</span>
          {step.message && <small>{step.message}</small>}
        </li>
      ))}
    </ol>
  );
}

function HostKeyConfirm({ nodeId }: { nodeId: string }) {
  const { t } = useI18n();
  const [keys, setKeys] = useState<HostKeyInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const inspect = async () => {
    setError(null);
    setConfirmed(null);
    try {
      const result = await getWorkspaceClient().inspectHostKey(nodeId);
      setKeys(result.keys);
    } catch (err) {
      setKeys(null);
      setError(err instanceof CoordinatorError ? err.message : String(err));
    }
  };

  const confirm = async (key: HostKeyInfo) => {
    setError(null);
    try {
      await getWorkspaceClient().confirmHostKey(nodeId, {
        algorithm: key.algorithm,
        fingerprint: key.fingerprint,
      });
      setConfirmed(key.fingerprint);
      setKeys((current) => current?.map((item) =>
        item.fingerprint === key.fingerprint ? { ...item, known: true } : item) ?? null);
    } catch (err) {
      setError(err instanceof CoordinatorError ? err.message : String(err));
    }
  };

  return (
    <div className="host-key">
      <button type="button" onClick={() => void inspect()}>
        <Fingerprint size={14} />{t('nodes.hostKeyInspect')}
      </button>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {confirmed && <p className="configured" role="status">{t('nodes.hostKeyRecorded')}</p>}
      {keys && (
        <ul className="host-key-list">
          {keys.map((key) => (
            <li key={key.algorithm}>
              <code>{key.algorithm} {key.fingerprint}</code>
              {key.known ? (
                <span className="configured">{t('nodes.hostKeyKnown')}</span>
              ) : (
                <button type="button" onClick={() => void confirm(key)}>
                  {t('nodes.hostKeyConfirm')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NodeManager() {
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const loadNodes = useWorkspaceStore((state) => state.loadNodes);
  const removeNode = useWorkspaceStore((state) => state.removeNode);
  const pendingActions = useWorkspaceStore((state) => state.pendingActions);
  const pending = (kind: string, key: string) =>
    pendingActions.some((action) => action.kind === kind && action.key === key);
  const [stepsByNode, setStepsByNode] = useState<Record<string, DiagnoseStep[]>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const { t } = useI18n();
  const { statusLabel } = useLabels();

  useEffect(() => { void loadNodes(); }, [loadNodes]);

  const diagnose = async (nodeId: string) => {
    setStepsByNode((current) => ({ ...current, [nodeId]: [] }));
    try {
      const result = await getWorkspaceClient().diagnoseNode(nodeId);
      setStepsByNode((current) => ({ ...current, [nodeId]: result.steps ?? [] }));
      await loadNodes();
    } catch (error) {
      const steps = error instanceof CoordinatorError
        ? (error.details.steps as DiagnoseStep[] | undefined) ?? []
        : [];
      setStepsByNode((current) => ({ ...current, [nodeId]: steps }));
      await loadNodes();
    }
  };

  return <section className="workspace-overlay" aria-label={t('nodes.aria')}>
    <header><div><span>{t('nodes.kicker')}</span><h1>{t('nodes.title')}</h1><p>{t('nodes.subtitle')}</p></div></header>
    <div className="overlay-grid">
      <div className="settings-card">
        <NodeSetupWizard />
      </div>
      <div className="settings-card node-list"><h2>{t('nodes.connected')}</h2>{nodes.length === 0 ? <p className="muted">{t('nodes.empty')}</p> : nodes.map((node) => <article key={node.id}>
        <div><Server size={18} /><strong>{node.name}</strong><span>{statusLabel(node.status)}</span></div><small>{node.api_url}</small>
        {node.credential_configured === true && <p className="configured">{t('nodes.credentialConfigured')}</p>}
        <button type="button" onClick={() => void diagnose(node.id)} disabled={pending('diagnose_node', node.id)}>
          <RefreshCw size={14} />{pending('diagnose_node', node.id) ? t('nodes.diagnosing') : t('nodes.rediagnose')}
        </button>
        {stepsByNode[node.id] && stepsByNode[node.id].length > 0 && (
          <DiagnoseSteps steps={stepsByNode[node.id]} />
        )}
        {node.kind === 'remote' && <HostKeyConfirm nodeId={node.id} />}
        {node.kind === 'remote' && <ProvisionWizard nodeId={node.id} />}
        {confirmRemove === node.id ? (
          <span className="confirm-inline" role="alertdialog" aria-label={t('nodes.removeConfirmTitle')}>
            <span>{t('nodes.removeConfirm')}</span>
            <button
              type="button"
              className="danger-link"
              onClick={() => { setConfirmRemove(null); void removeNode(node.id); }}
              disabled={pending('delete_node', node.id)}
            >
              {t('nodes.removeSure')}
            </button>
            <button type="button" onClick={() => setConfirmRemove(null)}>{t('nodes.removeCancel')}</button>
          </span>
        ) : (
          <button
            type="button"
            className="danger-link"
            onClick={() => setConfirmRemove(node.id)}
            disabled={pending('delete_node', node.id)}
          >
            <Trash2 size={14} />{t('nodes.remove')}
          </button>
        )}
      </article>)}</div>
    </div>
  </section>;
}
