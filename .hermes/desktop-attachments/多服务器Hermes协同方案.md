# 多服务器Hermes协同方案

> 创建时间：2026-07-28
> 最后更新：2026-07-28

---

## 一、为什么需要多服务器协同

| 原因 | 说明 |
|------|------|
| **并发能力** | 单机最多10线程，多机可扩展到40+ |
| **地理位置** | 硅谷+曼谷，覆盖不同时区 |
| **任务隔离** | 不同任务分配到不同服务器 |
| **容灾备份** | 一台挂了，其他继续 |
| **成本优化** | 不同配置的服务器处理不同任务 |

---

## 二、服务器清单

| 服务器 | 位置 | IP | 用户 | 密码 | 用途 |
|--------|------|-----|------|------|------|
| 本地 Mac | 美国 | - | yancyfeng | - | 调度中心 |
| YGG | 美国硅谷 | 49.51.191.48 | root | Dpxx8888 | 计算节点 |
| YMG1 | 泰国曼谷 | 43.133.121.160 | root | Dpxx8888 | 计算节点 |
| YMG2 | 泰国曼谷 | 124.156.243.51 | root | Dpxx8888 | 计算节点 |

---

## 三、架构图

```
用户下达任务
    ↓
本地 JARVIS (调度中心)
├── 本地子代理 ×10
├── SSH → YGG (硅谷) ×10
├── SSH → YMG1 (曼谷) ×10
└── SSH → YMG2 (曼谷) ×10
    ↓
结果汇总返回用户
```

**总并发能力：40线程**

---

## 四、接管新服务器流程

### 步骤1：获取服务器信息

需要以下信息：
- IP地址
- 端口（默认22）
- 用户名（通常root）
- 密码或SSH密钥

### 步骤2：SSH连接测试

```bash
sshpass -p '密码' ssh -o StrictHostKeyChecking=no root@IP "echo '连接成功'"
```

如果host key冲突：
```bash
ssh-keygen -R IP
```

### 步骤3：检查/安装Hermes

```bash
# 检查是否已安装
which hermes && hermes --version

# 未安装则执行安装脚本
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

### 步骤4：配置Provider

编辑 `~/.hermes/config.yaml`，配置model部分：

```yaml
model:
  default: gpt-5.5
  provider: custom
  api_mode: chat_completions
  base_url: https://hk.rootflowai.com/v1
  api_key: sk-AjSUXRJXWFrBbiJB31y9V9W4AQbpRP2JS7VpcFyuozFTsx6z
  reasoning_effort: high
providers: {}
fallback_providers: []
```

**配置命令**：
```bash
# 用Python脚本替换配置
sshpass -p '密码' ssh root@IP 'python3 << "PYEOF"
import re

with open("/root/.hermes/config.yaml", "r") as f:
    content = f.read()

# 删除原model块
content = re.sub(r"^model:.*?(?=\n\w|\Z)", "", content, flags=re.DOTALL | re.MULTILINE)
content = re.sub(r"^providers:.*?(?=\n\w|\Z)", "", content, flags=re.DOTALL | re.MULTILINE)
content = re.sub(r"^fallback_providers:.*?(?=\n\w|\Z)", "", content, flags=re.DOTALL | re.MULTILINE)

# 插入新配置
new_config = """model:
  default: gpt-5.5
  provider: custom
  api_mode: chat_completions
  base_url: https://hk.rootflowai.com/v1
  api_key: sk-AjSUXRJXWFrBbiJB31y9V9W4AQbpRP2JS7VpcFyuozFTsx6z
  reasoning_effort: high
providers: {}
fallback_providers: []

"""
content = new_config + content.lstrip()

with open("/root/.hermes/config.yaml", "w") as f:
    f.write(content)

print("配置完成")
PYEOF
'
```

### 步骤5：设置并发上限

```bash
sshpass -p '密码' ssh root@IP "sed -i 's/max_concurrent_children: 3/max_concurrent_children: 10/' ~/.hermes/config.yaml"
```

### 步骤6：验证配置

```bash
# 检查配置
sshpass -p '密码' ssh root@IP "cat ~/.hermes/config.yaml | grep -A 8 '^model:'"

# 测试API
sshpass -p '密码' ssh root@IP "hermes chat -q '返回ok'"
```

---

## 五、同步Skills

### 5.1 打包本地Skills

```bash
cd ~/.hermes
tar czf /tmp/hermes_skills.tar.gz skills/
ls -lh /tmp/hermes_skills.tar.gz
```

### 5.2 上传到服务器

```bash
sshpass -p '密码' scp /tmp/hermes_skills.tar.gz root@IP:/tmp/
```

### 5.3 在服务器上解压

```bash
sshpass -p '密码' ssh root@IP "cd ~/.hermes && tar xzf /tmp/hermes_skills.tar.gz && rm /tmp/hermes_skills.tar.gz"
```

### 5.4 验证Skills

```bash
sshpass -p '密码' ssh root@IP "ls ~/.hermes/skills/ | wc -l"
```

---

## 六、使用方式

### 6.1 单机执行

```bash
sshpass -p '密码' ssh root@IP "hermes chat -q '你的任务'"
```

### 6.2 单机并行（10线程）

```bash
sshpass -p '密码' ssh root@IP "
for i in {1..10}; do
  hermes chat -q '任务$i：描述' > /tmp/task_$i.log 2>&1 &
done
wait
# 收集结果
for i in {1..10}; do cat /tmp/task_$i.log; done
"
```

### 6.3 多机并行（30线程）

```bash
# 三台服务器同时执行
sshpass -p 'Dpxx8888' ssh root@49.51.191.48 "
for i in {1..10}; do hermes chat -q '任务$i' > /tmp/t_$i.log 2>&1 & done
wait
" &

sshpass -p 'Dpxx8888' ssh root@43.133.121.160 "
for i in {1..10}; do hermes chat -q '任务$i' > /tmp/t_$i.log 2>&1 & done
wait
" &

sshpass -p 'Dpxx8888' ssh root@124.156.243.51 "
for i in {1..10}; do hermes chat -q '任务$i' > /tmp/t_$i.log 2>&1 & done
wait
" &

wait
echo "全部完成"
```

### 6.4 本地+远程（40线程）

在Hermes对话中：
```
你：三台服务器同时执行xxx任务
我：
1. 本地delegate_task 10个子代理
2. SSH到YGG执行10个任务
3. SSH到YMG1执行10个任务
4. SSH到YMG2执行10个任务
5. 汇总结果返回
```

---

## 七、复检清单

每次操作前/后检查：

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| SSH连接 | `ssh root@IP "echo ok"` | 返回ok |
| Hermes版本 | `hermes --version` | v0.19.0 |
| Provider | `grep -A 8 '^model:' ~/.hermes/config.yaml` | gpt-5.5/rootflowai |
| API测试 | `hermes chat -q '返回ok'` | 返回ok |
| 并发上限 | `grep max_concurrent_children ~/.hermes/config.yaml` | 10 |
| Skills | `ls ~/.hermes/skills/ \| wc -l` | 146+ |

---

## 八、故障排除

### 问题1：SSH连接失败

```bash
# 删除旧的host key
ssh-keygen -R IP

# 重试连接
sshpass -p '密码' ssh -o StrictHostKeyChecking=no root@IP "echo ok"
```

### 问题2：Hermes API 401错误

```bash
# 检查api_key
grep 'api_key:' ~/.hermes/config.yaml

# 重新配置
# 参考步骤4
```

### 问题3：Skills不生效

```bash
# 重启Hermes或开始新会话
# 检查skills目录
ls ~/.hermes/skills/
```

### 问题4：并发上限未生效

```bash
# 检查配置
grep max_concurrent_children ~/.hermes/config.yaml

# 重新设置
sed -i 's/max_concurrent_children: 3/max_concurrent_children: 10/' ~/.hermes/config.yaml
```

---

## 九、保存记忆

每次接管服务器后，在Hermes中保存记忆：

```
服务器名 = 位置 (IP)，SSH root/密码，Hermes版本，Provider配置
```

示例：
```
YGG = 硅谷(49.51.191.48)，SSH root/Dpxx8888，Hermes v0.19.0，provider: rootflowai/gpt-5.5
YMG1 = 曼谷(43.133.121.160)，SSH root/Dpxx8888，Hermes v0.19.0，provider: rootflowai/gpt-5.5
YMG2 = 曼谷(124.156.243.51)，SSH root/Dpxx8888，Hermes v0.19.0，provider: rootflowai/gpt-5.5
```

---

## 十、今日成果

| 项目 | 结果 |
|------|------|
| 接管服务器 | 3台 (YGG/YMG1/YMG2) |
| Hermes版本 | 全部v0.19.0 |
| Provider配置 | 统一rootflowai/gpt-5.5 |
| Skills数量 | 146个 |
| 40线程并行测试 | ✅ 全部成功 |
| 最快响应 | YMG2 ~1秒 |

---

## 十一、后续可扩展

| 扩展方向 | 说明 |
|----------|------|
| 国内服务器 | 配置国内Provider（DeepSeek/Kimi/阿里） |
| SSH密钥 | 配置免密登录，服务器间互通 |
| 自动化部署 | 写脚本一键部署项目 |
| 监控告警 | 检查服务器状态，异常告警 |
| 定时任务 | 用cronjob定时执行任务 |

---

**文档版本：v1.0**
**作者：JARVIS**
