import sqlite3
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "xuanji.db"

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            goal TEXT NOT NULL,
            task_graph JSON NOT NULL,
            status TEXT DEFAULT 'draft',
            thinking TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME,
            config JSON DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            agent_type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            dependencies JSON DEFAULT '[]',
            result TEXT DEFAULT '',
            error TEXT DEFAULT '',
            logs JSON DEFAULT '[]',
            output_files JSON DEFAULT '[]',
            started_at DATETIME,
            completed_at DATETIME,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            estimated_time TEXT DEFAULT '',
            output_format TEXT DEFAULT '',
            FOREIGN KEY (run_id) REFERENCES runs(id)
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id);
    """)
    conn.close()

def save_run(run_id: str, goal: str, nodes: list, thinking: str = "", status: str = "planned"):
    conn = get_db()
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT OR REPLACE INTO runs (id, goal, task_graph, status, thinking, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (run_id, goal, json.dumps(nodes, ensure_ascii=False), status, thinking, now, now)
    )
    for node in nodes:
        conn.execute(
            "INSERT OR REPLACE INTO tasks (id, run_id, title, description, agent_type, status, dependencies, max_retries, estimated_time, output_format) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (node["id"], run_id, node.get("title",""), node.get("description",""), node.get("agent_type","research"),
             node.get("status","pending"), json.dumps(node.get("dependencies",[])),
             node.get("max_retries",3), node.get("estimated_time",""), node.get("output_format",""))
        )
    conn.commit()
    conn.close()

def update_task_status(task_id: str, status: str, result: str = "", error: str = ""):
    conn = get_db()
    now = datetime.now().isoformat()
    if status == "running":
        conn.execute("UPDATE tasks SET status=?, started_at=? WHERE id=?", (status, now, task_id))
    elif status in ("success", "failed", "timeout", "skipped"):
        conn.execute("UPDATE tasks SET status=?, result=?, error=?, completed_at=? WHERE id=?", (status, result, error, now, task_id))
    else:
        conn.execute("UPDATE tasks SET status=? WHERE id=?", (status, task_id))
    conn.commit()
    conn.close()

def update_run_status(run_id: str, status: str):
    conn = get_db()
    now = datetime.now().isoformat()
    if status == "running":
        conn.execute("UPDATE runs SET status=?, started_at=?, updated_at=? WHERE id=?", (status, now, now, run_id))
    elif status in ("completed", "failed"):
        conn.execute("UPDATE runs SET status=?, completed_at=?, updated_at=? WHERE id=?", (status, now, now, run_id))
    else:
        conn.execute("UPDATE runs SET status=?, updated_at=? WHERE id=?", (status, now, run_id))
    conn.commit()
    conn.close()

def get_run(run_id: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    if not row:
        conn.close()
        return None
    tasks = conn.execute("SELECT * FROM tasks WHERE run_id=? ORDER BY rowid", (run_id,)).fetchall()
    conn.close()
    return {
        "id": row["id"],
        "goal": row["goal"],
        "thinking": row["thinking"],
        "status": row["status"],
        "nodes": [
            {
                "id": t["id"], "title": t["title"], "description": t["description"],
                "agent_type": t["agent_type"], "status": t["status"],
                "dependencies": json.loads(t["dependencies"]),
                "result": t["result"], "error": t["error"],
                "estimated_time": t["estimated_time"], "output_format": t["output_format"],
            }
            for t in tasks
        ],
        "created_at": row["created_at"],
    }

def list_runs(limit: int = 50) -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    results = []
    for row in rows:
        tasks = conn.execute("SELECT id, title, agent_type, status FROM tasks WHERE run_id=?", (row["id"],)).fetchall()
        results.append({
            "id": row["id"],
            "goal": row["goal"],
            "status": row["status"],
            "created_at": row["created_at"],
            "nodes": [{"id": t["id"], "title": t["title"]} for t in tasks],
        })
    conn.close()
    return results

def get_task_result(run_id: str) -> dict:
    conn = get_db()
    tasks = conn.execute("SELECT id, title, status, result FROM tasks WHERE run_id=?", (run_id,)).fetchall()
    conn.close()
    return {t["id"]: {"title": t["title"], "status": t["status"], "result": t["result"]} for t in tasks}
