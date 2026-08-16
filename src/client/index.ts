/**
 * dsh-dashboards — client entry: registers a '看板' conversation tab
 * ('conversation.view' slot) backed by the host half's /dashboards API.
 */
import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DashboardView } from './DashboardView.tsx'
import { en, NS, zh } from './locales.ts'

export const inject = ['slots', 'conversation', 'locale']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-dashboards: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'dashboard',
      order: 90,
      locale: NS,
      label: () => t('view.dashboard'),
    }, (props) => DashboardView({ ...props })))
}
