import TaskEditor from './TaskEditor';
import type { WorkflowTask } from '../../lib/client';

export default function TaskExecutionTab({ task }: { task: WorkflowTask }) {
  return <TaskEditor task={task} />;
}
