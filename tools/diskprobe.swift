// tools/diskprobe.swift — 磁盘容量探针（2026-10-22，方案 A 的唯一数据源）。
//
// 为什么不用 df：df 只能给硬可用，缺 purgeable；而「用户还能写多少」的权威口径是
// NSURL 的 availableCapacityForImportantUsage —— Finder 与 iStat Menus 用的就是它
// （本机实测：important − available == iStat 的 Purgeable，逐字节吻合）。
//
// 为什么不用 osascript：JXA 的 resourceValuesForKeys 对本组键返回空字典
// （2026-10-22 实测 count=2 / count=0，两种桥接写法都拿不到值），不可用。
//
// 用法：diskprobe [volumePath]   → 单行 JSON（字节数）
//   {"available":...,"important":...,"opportunistic":...,"total":...}
// 失败一律非零退出（调用方据此降级到 df，并把 purgeable 记 null —— 不填 0）。
import Foundation

let volume = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/System/Volumes/Data"
let keys: Set<URLResourceKey> = [
    .volumeTotalCapacityKey,
    .volumeAvailableCapacityKey,
    .volumeAvailableCapacityForImportantUsageKey,
    .volumeAvailableCapacityForOpportunisticUsageKey,
]
let url = URL(fileURLWithPath: volume)
guard let values = try? url.resourceValues(forKeys: keys) else {
    FileHandle.standardError.write(Data("diskprobe: resourceValues failed for \(volume)\n".utf8))
    exit(2)
}
let payload: [String: Any] = [
    "total": values.volumeTotalCapacity ?? 0,
    "available": values.volumeAvailableCapacity ?? 0,
    "important": values.volumeAvailableCapacityForImportantUsage ?? 0,
    "opportunistic": values.volumeAvailableCapacityForOpportunisticUsage ?? 0,
]
do {
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    guard let text = String(data: data, encoding: .utf8) else { exit(2) }
    print(text)
} catch {
    FileHandle.standardError.write(Data("diskprobe: encode failed\n".utf8))
    exit(2)
}
