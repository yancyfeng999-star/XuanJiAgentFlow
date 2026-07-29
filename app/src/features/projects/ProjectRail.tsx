import { useEffect, useState } from 'react';
import { FolderOpen, GitBranch, Network, Plus, Settings2, Sparkles } from 'lucide-react';

import { selectProjectDir } from '../../lib/runtime';
import { useWorkspaceStore, type WorkspacePanel } from '../../store/workspaceStore';

const items: Array<[typeof GitBranch, string, WorkspacePanel]> = [
  [GitBranch, '当前工作流', 'workflow'],
  [Network, 'Hermes 节点', 'nodes'],
  [Settings2, '设置', 'settings'],
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
    <nav className="project-rail" aria-label="项目资源栏">
      <div className="brand">
        <Sparkles size={20} />
        <div>
          <b>璇玑</b>
          <small>XUANJI 2.0</small>
        </div>
      </div>

      <label className="rail-label" htmlFor="project-select">
        项目
      </label>
      <select
        id="project-select"
        className="project-select"
        value={project?.id ?? ''}
        onChange={(event) => void loadProject(event.target.value)}
      >
        <option value="">选择项目</option>
        {projects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>

      <form className="project-create" onSubmit={submit}>
        <label htmlFor="project-name">新项目</label>
        <div>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" aria-label="创建项目">
            <Plus size={15} />
          </button>
        </div>
        <label htmlFor="project-root">项目目录</label>
        <div>
          <input
            id="project-root"
            value={rootPath}
            placeholder="可选，选择本地目录"
            onChange={(event) => setRootPath(event.target.value)}
          />
          <button type="button" onClick={() => void pickDir()} aria-label="选择项目目录">
            <FolderOpen size={15} />
          </button>
        </div>
      </form>

      <ul>
        {items.map(([Icon, label, panel]) => (
          <li key={label}>
            <button
              type="button"
              className={activePanel === panel ? 'active' : ''}
              onClick={() => setActivePanel(panel)}
            >
              <Icon size={17} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
