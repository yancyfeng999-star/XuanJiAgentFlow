import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import InputPanel from '../panels/InputPanel';
import PlanPanel from '../panels/PlanPanel';
import EditPanel from '../panels/EditPanel';
import RunPanel from '../panels/RunPanel';
import ResultPanel from '../panels/ResultPanel';
import HistoryPanel from '../panels/HistoryPanel';
import Sidebar from '../components/Sidebar';
import { listRuns, getRun } from '../lib/api';
import './Canvas.css';

const nodeTypes = {
  input: InputPanel,
  plan: PlanPanel,
  edit: EditPanel,
  run: RunPanel,
  result: ResultPanel,
  history: HistoryPanel,
};

export default function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    {
      id: 'history',
      type: 'history',
      position: { x: 50, y: 50 },
      data: { runs: [], onSelect: () => {} },
    },
    {
      id: 'input',
      type: 'input',
      position: { x: 50, y: 400 },
      data: { onPlan: () => {} },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    listRuns().then(r => {
      setRuns(r);
      setNodes(nds => nds.map(n => {
        if (n.id === 'history') return { ...n, data: { runs: r, onSelect: handleRunSelect } };
        if (n.id === 'input') return { ...n, data: { onPlan: handlePlan } };
        return n;
      }));
    }).catch(() => {});
  }, []);

  const refreshRuns = () => {
    listRuns().then(r => {
      setRuns(r);
      setNodes(nds => nds.map(n =>
        n.id === 'history' ? { ...n, data: { ...n.data, runs: r, onSelect: handleRunSelect } } : n
      ));
    }).catch(() => {});
  };

  const handleRunSelect = async (runId: string) => {
    const run = await getRun(runId);
    const nodes2: Node[] = [
      { id: 'history', type: 'history', position: { x: 50, y: 50 }, data: { runs, onSelect: handleRunSelect } },
      { id: 'input', type: 'input', position: { x: 50, y: 400 }, data: { onPlan: handlePlan, initialGoal: run.goal } },
      { id: 'plan', type: 'plan', position: { x: 480, y: 50 }, data: { result: run, onConfirm: () => showEdit(run) } },
      { id: 'edit', type: 'edit', position: { x: 910, y: 50 }, data: { nodes: run.nodes || [], onExecute: () => showRun(run) } },
    ];
    const edges2: Edge[] = [
      { id: 'e-ip', source: 'input', target: 'plan', animated: true, style: { stroke: '#6366F1', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' } },
      { id: 'e-pe', source: 'plan', target: 'edit', animated: true, style: { stroke: '#6366F1', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' } },
    ];
    if (run.status === 'completed') {
      nodes2.push({ id: 'run', type: 'run', position: { x: 1340, y: 50 }, data: { runId: run.id, goal: run.goal, nodes: run.nodes, onComplete: () => {} } });
      nodes2.push({ id: 'result', type: 'result', position: { x: 1770, y: 50 }, data: { runId: run.id, goal: run.goal, nodes: run.nodes } });
      edges2.push({ id: 'e-er', source: 'edit', target: 'run', animated: true, style: { stroke: '#10B981', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } });
      edges2.push({ id: 'e-rr', source: 'run', target: 'result', animated: true, style: { stroke: '#10B981', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } });
    }
    setNodes(nodes2);
    setEdges(edges2);
  };

  const handlePlan = (result: any) => {
    const newNodes: Node[] = [
      { id: 'history', type: 'history', position: { x: 50, y: 50 }, data: { runs, onSelect: handleRunSelect } },
      { id: 'input', type: 'input', position: { x: 50, y: 400 }, data: { onPlan: handlePlan, initialGoal: result.goal } },
      { id: 'plan', type: 'plan', position: { x: 480, y: 50 }, data: { result, onConfirm: () => showEdit(result) } },
    ];
    setNodes(newNodes);
    setEdges([
      { id: 'e-ip', source: 'input', target: 'plan', animated: true, style: { stroke: '#6366F1', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' } },
    ]);
  };

  const showEdit = (result: any) => {
    setNodes(nds => [
      ...nds.filter(n => !['edit', 'run', 'result'].includes(n.id)),
      { id: 'edit', type: 'edit', position: { x: 910, y: 50 }, data: { nodes: result.nodes || [], onExecute: () => showRun(result) } },
    ]);
    setEdges(eds => [
      ...eds.filter(e => e.id !== 'e-pe'),
      { id: 'e-pe', source: 'plan', target: 'edit', animated: true, style: { stroke: '#6366F1', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' } },
    ]);
  };

  const showRun = (result: any) => {
    setNodes(nds => [
      ...nds.filter(n => !['run', 'result'].includes(n.id)),
      { id: 'run', type: 'run', position: { x: 1340, y: 50 }, data: { runId: result.id, goal: result.goal, nodes: result.nodes, onComplete: () => showResult(result) } },
    ]);
    setEdges(eds => [
      ...eds.filter(e => e.id !== 'e-er'),
      { id: 'e-er', source: 'edit', target: 'run', animated: true, style: { stroke: '#10B981', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } },
    ]);
  };

  const showResult = (result: any) => {
    setNodes(nds => [
      ...nds.filter(n => n.id !== 'result'),
      { id: 'result', type: 'result', position: { x: 1770, y: 50 }, data: { runId: result.id, goal: result.goal, nodes: result.nodes } },
    ]);
    setEdges(eds => [
      ...eds.filter(e => e.id !== 'e-rr'),
      { id: 'e-rr', source: 'run', target: 'result', animated: true, style: { stroke: '#10B981', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } },
    ]);
    refreshRuns();
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    []
  );

  return (
    <div className="canvas-layout">
      <Sidebar />
      <div className="canvas-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: '#6366F1', strokeWidth: 2 },
          }}
        >
          <Background gap={20} size={1} color="#E5E7EB" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const map: Record<string, string> = { input: '#6366F1', plan: '#8B5CF6', edit: '#3B82F6', run: '#10B981', result: '#F59E0B', history: '#9CA3AF' };
              return map[n.type || ''] || '#ccc';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
