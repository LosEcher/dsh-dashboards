/**
 * 看板在「侧栏折叠态」里的入口（`shell.leading.actions` 座位）。
 *
 * 为什么需要它：侧栏折叠时它会连同侧栏那行一起被卸载，只剩这个座位上的按钮；
 * 不给这个入口，看板就变成"必须先展开侧栏再点一行"。行为与侧栏行一致：
 * 点一次打开看板（占据中心列），再点一次回到会话。
 */
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NS } from './locales'
import { DashboardIcon } from './DashboardIcon'
import css from './DockEntry.module.css'

/** 看板占用的 main 面板 key（与 `slots.register({ name:'main', key })` 一致）。 */
export const DASHBOARD_PANEL_ID = 'dashboard' as MainPanelId

/** 座位交给这个控件的唯一动作。 */
export interface DashboardDockInjected {
  toggleDashboard: () => void
}

export type DashboardDockEntryProps =
  PropsRuntime<'shell.leading.actions'>
  & DashboardDockInjected
  & PropsLocale<NS>

export function DashboardDockEntry({ usePanelInfo, toggleDashboard, t }: DashboardDockEntryProps) {
  const active = usePanelInfo((info) => info.activePanelId === DASHBOARD_PANEL_ID)
  const label = t('seat.openDashboard')
  return (
    <Tooltip label={label} delayMs={500}>
      <button
        type="button"
        className={css.button}
        aria-label={label}
        aria-pressed={active}
        onClick={() => { toggleDashboard() }}
      >
        <DashboardIcon size={16} />
      </button>
    </Tooltip>
  )
}
