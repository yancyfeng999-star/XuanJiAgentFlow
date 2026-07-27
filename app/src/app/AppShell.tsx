import ProjectRail from '../features/projects/ProjectRail'; import RunBar from '../features/runs/RunBar'; import WorkflowCanvas from '../features/canvas/WorkflowCanvas'; import Inspector from '../features/inspector/Inspector'; import './AppShell.css';
export default function AppShell(){return <div className="app-shell"><ProjectRail/><RunBar/><WorkflowCanvas/><Inspector/></div>}
