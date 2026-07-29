import { useEffect, useState } from 'react';

import type { WorkflowTask } from '../../lib/client';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function TaskEditor({ task }: { task: WorkflowTask }) {
  const frozen = useWorkspaceStore((state) => state.workflow?.status !== 'draft');
  const updateTask = useWorkspaceStore((state) => state.updateTask);
  const removeTask = useWorkspaceStore((state) => state.removeTask);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [prompt, setPrompt] = useState(task.prompt);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPrompt(task.prompt);
  }, [task]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void updateTask(task.id, { title, description, prompt });
  };

  return (
    <form className="task-editor" onSubmit={submit}>
      <label htmlFor="task-title">任务标题</label>
      <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={frozen} />
      <label htmlFor="task-description">任务描述</label>
      <textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={frozen} />
      <label htmlFor="task-prompt">任务 Prompt</label>
      <textarea id="task-prompt" aria-label="任务 Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={frozen} />
      <button type="submit" className="form-primary" disabled={frozen}>保存任务</button>
      {!frozen && <button type="button" className="danger-link" onClick={() => void removeTask(task.id)}>删除任务</button>}
    </form>
  );
}
