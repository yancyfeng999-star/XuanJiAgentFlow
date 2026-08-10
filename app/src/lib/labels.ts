const statusLabels: Record<string, string> = {
  accepted: '已接受',
  archived: '已归档',
  artifact_failed: '产物处理失败',
  blocked: '已阻塞',
  cancelled: '已取消',
  cancelling: '取消中',
  claimed: '已领取',
  collecting: '收集中',
  completed: '已完成',
  degraded: '服务降级',
  dispatch_failed: '派发失败',
  dispatching: '派发中',
  draft: '草稿',
  failed: '失败',
  idle: '待运行',
  offline: '离线',
  online: '在线',
  paused: '已暂停',
  pending: '等待执行',
  planning: '规划中',
  ready: '准备就绪',
  reviewed: '已审核',
  running: '运行中',
  skipped: '已跳过',
  success: '已完成',
  timeout: '已超时',
  unknown: '状态未知',
};

const agentTypeLabels: Record<string, string> = {
  business: '业务',
  code: '代码',
  general: '通用',
  research: '研究',
  review: '审核',
  writing: '写作',
};

const schedulingModeLabels: Record<string, string> = {
  auto: '自动调度',
  fixed: '固定节点',
  local_first: '本地优先',
  node_group: '指定节点组',
  remote_first: '远程优先',
};

const mediaTypeLabels: Record<string, string> = {
  'application/json': '结构化数据',
  'application/octet-stream': '二进制文件',
  'application/pdf': '便携文档',
  'image/jpeg': '压缩图像',
  'image/png': '无损图像',
  'text/csv': '表格文本',
  'text/markdown': '标记文本',
  'text/plain': '纯文本',
};

const capabilityLabels: Record<string, string> = {
  'fake-model': '测试模型',
  gpu: '图形处理器',
  research: '研究',
  terminal: '终端',
};

export function statusLabel(value: string | null | undefined): string {
  if (!value) return '状态未知';
  return statusLabels[value] ?? '状态未知';
}

export function agentTypeLabel(value: string | null | undefined): string {
  if (!value) return '通用';
  return agentTypeLabels[value] ?? '其他类型';
}

export function schedulingModeLabel(value: string | null | undefined): string {
  if (!value) return '自动调度';
  return schedulingModeLabels[value] ?? '其他调度方式';
}

export function mediaTypeLabel(value: string | null | undefined): string {
  if (!value) return '自动识别';
  return mediaTypeLabels[value] ?? '其他文件类型';
}

export function capabilityLabel(value: string): string {
  return capabilityLabels[value] ?? value;
}
