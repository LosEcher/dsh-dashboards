/**
 * dsh-dashboards — client locale dictionary (zh/en).
 */
export const NS = 'dashboard'

export const zh = {
  'view.dashboard': '看板',
  'refresh': '刷新',
  'updated': '更新于',
  'noData': '无数据',
  'error': '加载失败',
  'retry': '重试',
  'disabled': '未启用',
  'pending': '等待中…',
  'widgets.empty': '暂无 widget 配置（在设置页或 /dashboards/widgets 配置）',
  'los.usage': 'LLM 用量与成本',
  'los.nodes': '执行节点矩阵',
  'los.metrics': 'los 任务统计',
  'macos.mem': 'MBP 内存',
  'macos.cpu': 'MBP 负载',
  'probe': '关键服务探活',
  'kuma': '服务状态',
  'col.cost': '成本',
  'col.calls': '调用',
  'col.tokens': 'tokens',
  'col.cache': '缓存命中',
  'col.sessions': '会话',
  'col.model': '模型',
  'col.status': '状态',
  'col.load': '负载',
  'col.mem': '内存',
  'col.platform': '平台',
  'col.heartbeat': '心跳',
  'col.latency': '延迟',
  'col.node': '节点',
  'col.detail': '详情',
}

export const en = {
  'view.dashboard': 'Dashboards',
  'refresh': 'Refresh',
  'updated': 'Updated',
  'noData': 'No data',
  'error': 'Load failed',
  'retry': 'Retry',
  'disabled': 'Disabled',
  'pending': 'Loading…',
  'widgets.empty': 'No widget configured (edit via settings or /dashboards/widgets)',
  'los.usage': 'LLM usage & cost',
  'los.nodes': 'Executor nodes',
  'los.metrics': 'los task stats',
  'macos.mem': 'MBP memory',
  'macos.cpu': 'MBP load',
  'probe': 'Service probes',
  'kuma': 'Service status',
  'col.cost': 'Cost',
  'col.calls': 'Calls',
  'col.tokens': 'Tokens',
  'col.cache': 'Cache hit',
  'col.sessions': 'Sessions',
  'col.model': 'Model',
  'col.status': 'Status',
  'col.load': 'Load',
  'col.mem': 'Memory',
  'col.platform': 'Platform',
  'col.heartbeat': 'Heartbeat',
  'col.latency': 'Latency',
  'col.node': 'Node',
  'col.detail': 'Detail',
}

export type DashboardKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dashboard': DashboardKey
  }
}
