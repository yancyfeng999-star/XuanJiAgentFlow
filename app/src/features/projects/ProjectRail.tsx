import { useEffect, useRef, useState } from 'react';
import { FolderOpen, GitBranch, Moon, Network, Pencil, Plus, Settings2, Sparkles, Sun, Trash2 } from 'lucide-react';

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
  const renameProject = useWorkspaceStore((state) => state.renameProject);
  const deleteProject = useWorkspaceStore((state) => state.deleteProject);
  const creating = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'create_project'));
  const renaming = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'rename_project'));
  const deleting = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'delete_project'));
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [renamingTo, setRenamingTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme());
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (!project && projects.length > 0) void loadProject(projects[0].id);
  }, [loadProject, project, projects]);
  useEffect(() => {
    if (confirmDelete) deleteDialogRef.current?.focus();
  }, [confirmDelete]);

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

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!project || !renamingTo?.trim()) return;
    void renameProject(project.id, renamingTo.trim());
    setRenamingTo(null);
  };

  const confirmDeleteProject = () => {
    if (!project || deleteConfirmName !== project.name) return;
    void deleteProject(project.id);
    setConfirmDelete(false);
    setDeleteConfirmName('');
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

      {project && (
        <div className="project-actions">
          {renamingTo === null ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => setRenamingTo(project.name)}
              aria-label={t('rail.renameProject')}
            >
              <Pencil size={14} />
            </button>
          ) : (
            <form className="project-rename" onSubmit={submitRename}>
              <input
                aria-label={t('rail.renameProject')}
                value={renamingTo}
                onChange={(event) => setRenamingTo(event.target.value)}
              />
              <button type="submit" disabled={renaming || !renamingTo.trim()}>
                {t('rail.renameSave')}
              </button>
              <button type="button" onClick={() => setRenamingTo(null)}>
                {t('rail.renameCancel')}
              </button>
            </form>
          )}
          <button
            type="button"
            className="icon-button danger"
            onClick={() => setConfirmDelete(true)}
            aria-label={t('rail.deleteProject')}
            aria-haspopup="dialog"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <details className="project-create-details" key={projects.length === 0 ? 'empty' : 'list'} defaultOpen={projects.length === 0}>
        <summary>{t('rail.newProject')}</summary>
        <form className="project-create" onSubmit={submit}>
          <label htmlFor="project-name">{t('rail.projectName')}</label>
          <div>
            <input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" aria-label={t('rail.createProject')} disabled={creating}>
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
      </details>

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

      {confirmDelete && project && (
        <div className="modal-backdrop">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('rail.deleteProject')}
            ref={deleteDialogRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmDelete(false);
            }}
          >
            <h2>{t('rail.deleteTitle', { name: project.name })}</h2>
            <p>{t('rail.deleteExplainer')}</p>
            <label htmlFor="delete-confirm-name">{t('rail.deleteConfirmLabel')}</label>
            <input
              id="delete-confirm-name"
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              autoComplete="off"
            />
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmDelete(false)}>
                {t('rail.renameCancel')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={confirmDeleteProject}
                disabled={deleting || deleteConfirmName !== project.name}
              >
                {t('rail.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
