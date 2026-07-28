import { FileClock, FileOutput, GitBranch, History, Network, Settings2, Sparkles } from 'lucide-react';
const items = [[GitBranch,'当前工作流'],[History,'历史版本'],[FileClock,'运行记录'],[FileOutput,'产出文件'],[Network,'Hermes 节点'],[Settings2,'设置']] as const;
export default function ProjectRail(){ const project=useWorkspaceStore((s)=>s.project); return <nav className="project-rail" aria-label="项目资源栏"><div className="brand"><Sparkles size={20}/><div><b>璇玑</b><small>XUANJI 2.0</small></div></div><div className="project-name">{project.name}</div><ul>{items.map(([Icon,label],i)=><li key={label}><button className={i===0?'active':''}><Icon size={17}/>{label}</button></li>)}</ul></nav> }
import { useWorkspaceStore } from '../../store/workspaceStore';
