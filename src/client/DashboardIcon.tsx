/**
 * 看板的侧栏图标（内联 SVG，颜色走 currentColor ⇒ 跟随令牌，不写死颜色）。
 *
 * 与画布的 4 格网格区分开：这里是"三根柱子 + 基线"的统计条形，语义是"度量/看板"。
 */
export function DashboardIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="3" y="8" width="2.6" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.7" y="4.5" width="2.6" height="7.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10.4" y="6.5" width="2.6" height="5.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
