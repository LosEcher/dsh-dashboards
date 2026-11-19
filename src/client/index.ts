/**
 * dsh-dashboards — client entry（2026-11-19 改版）
 *
 * 改动：从「会话里的一个标签页」（`conversation.view`）改成**应用级面板**：
 *   ① `main` —— 看板占据中心列（与画布同级）；
 *   ② `sidebar.panellist` —— 侧栏一行「看板」；
 *   ③ `shell.leading.actions` —— 侧栏折叠时的入口（折叠会把 ② 卸载掉）。
 *
 * 为什么改（实测依据）：看板的数据全是**全局**的（磁盘/机队/网络/调度面），
 * 没有任何一项跟"当前会话"有关；组件本身也只用到 `props.t`，零 session 依赖。
 * 放在会话标签里导致两个实际问题：不开会话看不到；开着画布时中心列被占、也没有入口。
 */
import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { DashboardView } from './DashboardView.tsx'
import { DashboardDockEntry, DASHBOARD_PANEL_ID } from './DockEntry.tsx'
import { DashboardIcon } from './DashboardIcon.tsx'
import { en, NS, zh } from './locales.ts'

export const inject = ['slots', 'layout', 'locale']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-dashboards: dictionaries')
  const t = ctx.locale.bind(NS)

  // ① 中心面板：看板本身。`t` 由这里注入（main 座位不保证给 t）。
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: DASHBOARD_PANEL_ID,
    locale: NS,
  }, (props) => DashboardView({ ...props, t })))

  // ② 侧栏一行。`id` 必须与上面的 `key` 相同（壳按 id 打开对应面板）。
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: DASHBOARD_PANEL_ID,
    // 排在画布之后：画布是"工作台"，看板是"看状态"，先工作后看状态。
    order: 5,
    locale: NS,
    label: () => t('nav.dashboard'),
  }, DashboardIcon))

  // ③ 侧栏折叠态入口。`selectPanel` 对未注册的 key 会抛，所以先证明自己已注册。
  ctx.slots.inject('shell.leading.actions', () => ctx.slots.register({
    name: 'shell.leading.actions',
    id: 'dashboards',
    order: 240,
    locale: NS,
    inject: (): { toggleDashboard: () => void } => ({
      toggleDashboard: () => {
        if (!ctx.slots.entries('main').some((entry) => entry.options.key === DASHBOARD_PANEL_ID)) return
        const active = ctx.layout.panelInfo.getSnapshot().activePanelId
        ctx.layout.selectPanel(active === DASHBOARD_PANEL_ID ? null : DASHBOARD_PANEL_ID)
      },
    }),
  }, DashboardDockEntry))
}
