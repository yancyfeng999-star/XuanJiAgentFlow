import json
from storage import get_db

def collect_results(run_id: str) -> dict:
    """收集器：汇总某个运行的所有任务产出"""
    conn = get_db()
    tasks = conn.execute(
        "SELECT id, title, agent_type, status, result, error FROM tasks WHERE run_id=? ORDER BY rowid",
        (run_id,)
    ).fetchall()
    conn.close()

    summary = {
        "total": len(tasks),
        "completed": 0,
        "failed": 0,
        "pending": 0,
        "tasks": {},
        "combined_text": "",
    }

    texts = []
    for t in tasks:
        summary["tasks"][t["id"]] = {
            "title": t["title"],
            "agent_type": t["agent_type"],
            "status": t["status"],
            "result": t["result"],
            "error": t["error"],
        }
        if t["status"] == "success":
            summary["completed"] += 1
            if t["result"]:
                texts.append(f"## {t['title']}\n\n{t['result']}")
        elif t["status"] == "failed":
            summary["failed"] += 1
        else:
            summary["pending"] += 1

    summary["combined_text"] = "\n\n---\n\n".join(texts)
    return summary


def export_to_text(run_id: str) -> str:
    """导出器：生成可复制粘贴的prompt文本"""
    conn = get_db()
    run = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    if not run:
        conn.close()
        return "运行不存在"

    tasks = conn.execute(
        "SELECT * FROM tasks WHERE run_id=? ORDER BY rowid",
        (run_id,)
    ).fetchall()
    conn.close()

    lines = [
        f"{'━'*50}",
        f"璇玑任务导出 | {run_id}",
        f"目标：{run['goal']}",
        f"{'━'*50}",
        "",
    ]

    total = len(tasks)
    for i, t in enumerate(tasks):
        deps = json.loads(t["dependencies"]) if t["dependencies"] else []
        dep_str = "无（可立即执行）" if not deps else f"依赖: {', '.join(deps)}"

        lines.append(f"━━━ 任务 {i+1}/{total} ━━━━━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"类型：{t['agent_type'].title()} Agent")
        lines.append(f"依赖：{dep_str}")
        lines.append(f"{'─'*40}")
        lines.append(f"目标：{t['title']}")
        if t["description"]:
            lines.append(f"要求：{t['description']}")
        if t["output_format"]:
            lines.append(f"产出格式：{t['output_format']}")
        lines.append(f"{'━'*50}")
        lines.append("")

    return "\n".join(lines)
