import { useEffect } from 'react';
import { FolderKanban, GitBranch, Network, PanelLeftClose, PanelLeftOpen, Settings2, Sparkles } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { NAV_COLLAPSED_KEY, useWorkspaceStore, type WorkspacePanel } from '../../store/workspaceStore';

const items: Array<{ icon: typeof GitBranch; label: string; panel: WorkspacePanel }> = [
  { icon: FolderKanban, label: 'nav.projects', panel: 'projects' },
  { icon: GitBranch, label: 'nav.workflow', panel: 'workflow' },
  { icon: Network, label: 'nav.nodes', panel: 'nodes' },
  { icon: Sparkles, label: 'nav.thinkingModels', panel: 'thinking_models' },
  { icon: Settings2, label: 'nav.settings', panel: 'settings' },
];

export default function WorkspaceNav() {
  const activePanel = useWorkspaceStore((state) => state.activePanel);
  const navCollapsed = useWorkspaceStore((state) => state.navCollapsed);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const setNavCollapsed = useWorkspaceStore((state) => state.setNavCollapsed);
  const setSettingsSection = useWorkspaceStore((state) => state.setSettingsSection);
  const t = useT();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1') {
        setNavCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, [setNavCollapsed]);

  const open = (panel: WorkspacePanel) => {
    setActivePanel(panel);
    if (panel === 'thinking_models') setSettingsSection('thinking_models');
    if (panel === 'settings') setSettingsSection('appearance');
  };

  return (
    <nav
      className={`workspace-nav${navCollapsed ? ' is-collapsed' : ''}`}
      aria-label={t('nav.workspace')}
    >
      <div className="workspace-nav__brand">
        <span>{navCollapsed ? t('nav.brandShort') : t('rail.brandName')}</span>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(item.label);
        const current = activePanel === item.panel;
        return (
          <button
            key={item.panel}
            type="button"
            className={current ? 'is-current' : undefined}
            aria-current={current ? 'page' : undefined}
            aria-label={label}
            title={label}
            onClick={() => open(item.panel)}
          >
            <Icon size={18} aria-hidden="true" />
            {!navCollapsed && <span>{label}</span>}
          </button>
        );
      })}
      <button
        type="button"
        className="workspace-nav__collapse"
        aria-label={navCollapsed ? t('nav.expand') : t('nav.collapse')}
        title={navCollapsed ? t('nav.expand') : t('nav.collapse')}
        onClick={() => setNavCollapsed(!navCollapsed)}
      >
        {navCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        {!navCollapsed && <span>{t('nav.collapse')}</span>}
      </button>
    </nav>
  );
}
