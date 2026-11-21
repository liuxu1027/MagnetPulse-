import { Bell, CheckCheck, Download, Pause, Play, ShieldAlert, Smartphone } from 'lucide-react';
import type { EngineStateSnapshot } from '../types/torrent';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '../utils/format';

interface AndroidNotificationPreviewProps {
  snapshot: EngineStateSnapshot;
  onNotificationAction: (action: 'pause_all' | 'resume_all' | 'mark_read') => Promise<void>;
  onPauseTask: (id: string) => void;
  onResumeTask: (id: string) => void;
}

export function AndroidNotificationPreview({
  snapshot,
  onNotificationAction,
  onPauseTask,
  onResumeTask,
}: AndroidNotificationPreviewProps) {
  const activeTasks = snapshot.tasks.filter((t) => t.status === 'downloading');
  const totalSelected = activeTasks.reduce((s, t) => s + t.selectedBytes, 0);
  const totalDownloaded = activeTasks.reduce((s, t) => s + t.downloadedBytes, 0);
  const avgPct = totalSelected > 0 ? Math.round((totalDownloaded / totalSelected) * 100) : 0;

  const primaryActive = activeTasks[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Interactive Android 15 Device Frame & Notification Shade */}
      <div className="lg:col-span-5 flex justify-center">
        <div className="w-full max-w-[390px] rounded-[32px] border border-white/[0.12] bg-[#0B0D12] p-4 shadow-2xl">
          {/* Android Status Bar */}
          <div className="flex items-center justify-between px-3 pb-3 text-[11px] font-mono-tabular text-[#C4C6D0]">
            <span>{new Date().toTimeString().slice(0, 5)}</span>
            <div className="flex items-center gap-2">
              <span>{snapshot.policy.simulatedNetwork === 'wifi' ? 'Wi-Fi' : '5G'}</span>
              <span>{snapshot.policy.simulatedCharging ? '充电 86%' : '86%'}</span>
            </div>
          </div>

          {/* Notification Shade Header */}
          <div className="rounded-3xl bg-[#171A23] border border-white/[0.08] p-4 space-y-3.5">
            <div className="flex items-center justify-between text-xs text-[#9AA0AC]">
              <span className="font-medium text-[#E3E2E6]">Android 前台服务通知栏</span>
              <span className="font-mono-tabular">dataSync</span>
            </div>

            {/* Ongoing ForegroundService Notification */}
            <div className="rounded-2xl bg-[#1E222E] border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[#A8C7FA]">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>MagnetPulse · 实时进度通知</span>
                </div>
                <span className="text-[11px] font-mono-tabular text-[#9AA0AC]">
                  {activeTasks.length > 0 ? `${avgPct}%` : '待机'}
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold text-[#E3E2E6] truncate">
                  {activeTasks.length > 0
                    ? `正在下载 ${activeTasks.length} 个任务 · ${formatSpeed(snapshot.totalDownloadBps)}`
                    : `就绪 · 共 ${snapshot.tasks.length} 个托管任务`}
                </div>
                <div className="mt-1 text-xs text-[#9AA0AC] truncate">
                  {primaryActive
                    ? `${primaryActive.name} · 剩余 ${formatEta(primaryActive.etaSeconds)}`
                    : 'FastResume 分片位图已安全持久化'}
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full bg-[#A8C7FA] transition-all duration-300"
                  style={{ width: `${activeTasks.length > 0 ? avgPct : 0}%` }}
                />
              </div>

              {/* Real PendingIntent Notification Actions */}
              <div className="flex items-center gap-4 pt-1 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => onNotificationAction('pause_all')}
                  className="inline-flex h-8 items-center gap-1.5 text-xs font-medium text-[#E3E2E6] hover:text-[#A8C7FA] transition-colors"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>全部暂停</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNotificationAction('resume_all')}
                  className="inline-flex h-8 items-center gap-1.5 text-xs font-medium text-[#A8C7FA] hover:text-[#BED6FC] transition-colors"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>全部继续</span>
                </button>
              </div>
            </div>

            {/* Compact Compose Task Preview Inside Phone */}
            <div className="pt-2 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[#9AA0AC]">
                <span>Jetpack Compose 移动端视图镜像</span>
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {snapshot.tasks.slice(0, 4).map((task) => {
                  const pct = formatPercent(task.downloadedBytes, task.selectedBytes);
                  return (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-white/[0.07] bg-[#0F1117] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-[#E3E2E6]">
                          {task.name}
                        </span>
                        {task.status === 'downloading' ? (
                          <button
                            type="button"
                            onClick={() => onPauseTask(task.id)}
                            aria-label={`暂停 ${task.name}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[#E3E2E6]"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        ) : task.status !== 'completed' ? (
                          <button
                            type="button"
                            onClick={() => onResumeTask(task.id)}
                            aria-label={`继续 ${task.name}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#A8C7FA]/15 text-[#A8C7FA]"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full bg-[#A8C7FA]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#8E94A0]">
                        <span>{pct.toFixed(0)}% · {formatBytes(task.downloadedBytes)}</span>
                        <span>{task.status === 'downloading' ? formatSpeed(task.downloadBps) : task.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Notification Channel Spec & Real-Time Event Log */}
      <div className="lg:col-span-7 space-y-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#171A23] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#E3E2E6]">
                NotificationChannel 通知通道与事件流
              </h2>
              <p className="mt-1 text-xs text-[#9AA0AC]">
                点击左侧安卓通知卡片中的「全部暂停 / 全部继续」按钮可直接驱动服务端队列并生成通知记录。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNotificationAction('mark_read')}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#1E222E] px-3 text-xs font-medium text-[#C4C6D0] hover:text-[#E3E2E6] whitespace-nowrap"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>全部标为已读</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-[#0F1117] p-3.5 space-y-1">
              <div className="font-mono-tabular text-[#A8C7FA]">magnetpulse_progress</div>
              <div className="text-[#E3E2E6] font-medium">实时传输进度通道 (IMPORTANCE_LOW)</div>
              <div className="text-[#8E94A0]">静默高刷新率更新进度条，绑定 ForegroundService dataSync。</div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0F1117] p-3.5 space-y-1">
              <div className="font-mono-tabular text-[#22C55E]">magnetpulse_complete</div>
              <div className="text-[#E3E2E6] font-medium">完成与策略提醒 (IMPORTANCE_DEFAULT)</div>
              <div className="text-[#8E94A0]">下载校验完成、网络策略挂起或异常发生时弹出系统提示。</div>
            </div>
          </div>

          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#0F1117] max-h-[340px] overflow-y-auto">
            {snapshot.notifications.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  {item.channel === 'policy' ? (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                  ) : (
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#A8C7FA]" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#E3E2E6]">
                      {item.title}
                      {!item.read && (
                        <span className="ml-2 text-[11px] font-normal text-[#A8C7FA]">未读</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[#9AA0AC]">{item.body}</div>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-mono-tabular text-[#8E94A0]">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
