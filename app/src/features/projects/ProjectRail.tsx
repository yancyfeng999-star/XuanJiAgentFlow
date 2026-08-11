import { useEffect, useState } from 'react';
import { FolderOpen, GitBranch, Moon, Network, Plus, Settings2, Sparkles, Sun } from 'lucide-react';

import { useI18n } from '../../lib/i18n';
import { selectProjectDir } from '../../lib/runtime';
import { resolveTheme, toggleTheme, type ResolvedTheme } from '../../lib/theme';
import { useWorkspaceStore, type WorkspacePanel } from '../../store/workspaceStore';

const items: Array<[typeof GitBranch, string, WorkspacePanel]> = [
  [GitBranch, 'nav.workflow', 'workflow'],
  [Network, 'nav.nodes', 'nodes'],
  [Settings2, 'nav.settings', 'settings'],
];

export default function ProjectRail() {
  const projects = useWorkspaceStore((state) => state.projects);
  const project = useWorkspaceStore((state) => state.project);
  const activePanel = useWorkspaceStore((state) => state.activePanel);
  const loadProjects = useWorkspaceStore((state) => state.loadProjects);
  const loadProject = useWorkspaceStore((state) => state.loadProject);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme());
  const { t } = useI18n();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (!project && projects.length > 0) void loadProject(projects[0].id);
  }, [loadProject, project, projects]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void createProject(name.trim(), rootPath.trim() || undefined);
    setName('');
    setRootPath('');
  };

  const pickDir = async () => {
    const selected = await selectProjectDir();
    if (selected) setRootPath(selected);
  };

  return (
    <nav className="project-rail" aria-label={t('nav.rail')}>
      <div className="brand">
        <Sparkles size={20} />
        <div>
          <b>璇玑</b>
          <small>{t('rail.brand')}</small>
        </div>
      </div>

      <label className="rail-label" htmlFor="project-select">
        {t('rail.project')}
      </label>
      <select
        id="project-select"
        className="project-select"
        value={project?.id ?? ''}
        onChange={(event) => void loadProject(event.target.value)}
      >
        <option value="">{t('rail.selectProject')}</option>
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>

      <form className="project-create" onSubmit={submit}>
        <label htmlFor="project-name">{t('rail.newProject')}</label>
        <div>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" aria-label={t('rail.createProject')}>
            <Plus size={15} />
          </button>
        </div>
        <label htmlFor="project-root">{t('rail.projectDir')}</label>
        <div>
          <input
            id="project-root"
            value={rootPath}
            placeholder={t('rail.projectDirPlaceholder')}
            onChange={(event) => setRootPath(event.target.value)}
          />
          <button type="button" onClick={() => void pickDir()} aria-label={t('rail.pickDir')}>
            <FolderOpen size={15} />
          </button>
        </div>
      </form>

      <ul>
        {items.map(([Icon, labelKey, panel]) => (
          <li key={panel}>
            <button
              type="button"
              className={activePanel === panel ? 'active' : ''}
              onClick={() => setActivePanel(panel)}
            >
              <Icon size={17} />
              {t(labelKey)}
            </button>
          </li>
        ))}
      </ul>

      <div className="rail-footer">
        <button
          type="button"
          className="theme-toggle"
          aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
          onClick={() => setTheme(toggleTheme())}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? t('theme.light') : t('theme.dark')}
        </button>
      </div>
    </nav>
  );
}
