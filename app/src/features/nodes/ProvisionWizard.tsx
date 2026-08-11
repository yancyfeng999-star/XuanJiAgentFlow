import { useState } from 'react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ProvisionWizard({ nodeId }: { nodeId: string }) {
  const provisionNode = useWorkspaceStore((state) => state.provisionNode);
  const [port, setPort] = useState('8642');
  const t = useT();

  return <form className="provision-form" onSubmit={(event) => { event.preventDefault(); void provisionNode(nodeId, Number(port)); }}>
    <label htmlFor={`hermes-port-${nodeId}`}>{t('provision.port')}</label>
    <input id={`hermes-port-${nodeId}`} type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} />
    <button type="submit">{t('provision.deploy')}</button>
  </form>;
}
