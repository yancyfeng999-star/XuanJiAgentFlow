# 备份与恢复

## 机制现状

Coordinator 数据目录（`~/Library/Application Support/com.xuanji.app/`）包含：

- `coordinator.db`（SQLite，WAL 模式）：项目、工作流、节点、运行、事件与产物清单
- `projects/`：项目产物文件
- `credentials.json`（0600）：凭据明文（OS 用户边界保护）
- `backups/`：人工时间点副本（当前无自动备份机制，属已知限制）

## 备份步骤

```bash
cp ~/Library/Application\ Support/com.xuanji.app/coordinator.db* /目标备份目录/
# 如需完整时间点：整目录复制（含 projects/ 与 credentials.json）
```

WAL 模式下连同 `-wal`/`-shm` 一起复制即可保证一致性。

## 恢复演练记录（2026-08-11，真实执行）

1. 复制生产数据目录的 `coordinator.db`/`-wal`/`-shm` 到隔离目录 `/tmp/xuanji-restore-drill/`。
2. `sqlite3 PRAGMA integrity_check;` → `ok`。
3. 源库与恢复库项目清单 SQL 对比 → 完全一致（5 个项目）。
4. 用打包 sidecar（`backend/dist/xuanji-coordinator`，与 0.3.x Release 同哈希）以恢复目录启动：`--data-dir /tmp/xuanji-restore-drill --port 18931`。
5. 经会话令牌调用 `GET /api/projects` → 项目清单与源库一致；无令牌调用 → `401 invalid_session`。
6. 演练进程已终止，隔离目录可安全删除。

结论：SQLite 备份-复制-恢复链路可用；会话保护在恢复实例上同样生效。

## 已知限制

- 无自动定时备份；建议后续版本加入启动时滚动副本（保留 N 份）。
- 凭据恢复依赖 `credentials.json` 同目录恢复；未验证跨机器迁移（Keychain 迁移属未来设计）。
