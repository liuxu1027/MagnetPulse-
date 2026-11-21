import { useMemo, useState } from 'react';
import {
  ArrowUpToLine,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Download,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { EngineStateSnapshot, TaskStatus, TorrentTask } from '../types/torrent';
import { formatBytes, formatEta, formatPercent, formatSpeed, STATUS_META } from '../utils/format';

interface DownloadQueueViewProps {
  snapshot: EngineStateSnapshot;
  onPauseTask: (id: string) => void;
  onResumeTask: (id: string) => void;
  onPromoteTask: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onInspectTask: (task: TorrentTask) => void;
  onOpenAddModal: () => void;
}

type FilterKey = 'all' | 'downloading' | 'queued' | 'paused' | 'completed';

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: '全部任务' },
  { id: 'downloading', label: '下载中' },
  { id: 'queued', label: '排队等待' },
  { id: 'paused', label: '已暂停/挂起' },
  { id: 'completed', label: '已完成' },
];

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'downloading') return <Download className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />;
  if (status === 'completed' || status === 'seeding') return <CheckCircle2 className="h-3.5 w-3.5 text-[#A8C7FA]" aria-hidden="true" />;
  if (status === 'queued' || status === 'policy_paused') return <Clock className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />;
  return <Pause className="h-3.5 w-3.5 text-[#9CA3AF]" aria-hidden="true" />;
}

function SpeedSparkline({ samples }: { samples: EngineStateSnapshot['speedHistory'] }) {
  const width = 460;
  const height = 72;
  const maxVal = Math.max(1024 * 1024, ...samples.map((s) => s.downloadBps));

  const points = useMemo(() => {
    if (samples.length < 2) {
      return `0,${height} ${width},${height}`;
    }
    return samples
      .map((s, idx) => {
        const x = (idx / (samples.length - 1)) * width;
        const y = height - (s.downloadBps / maxVal) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [samples, maxVal]);

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[72px] w-full overflow-visible"
      preserveAspectRatio="none"
      aria-label="实时下行速率趋势曲线"
    >
      <defs>
        <linearGradient id="dlAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A8C7FA" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#A8C7FA" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#dlAreaGrad)" />
      <polyline
        fill="none"
        stroke="#A8C7FA"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function DownloadQueueView({
  snapshot,
  onPauseTask,
  onResumeTask,
  onPromoteTask,
  onPauseAll,
  onResumeAll,
  onInspectTask,
  onOpenAddModal,
}: DownloadQueueViewProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.tasks.filter((t) => {
      if (filter === 'downloading' && t.status !== 'downloading') return false;
      if (filter === 'queued' && t.status !== 'queued') return false;
      if (filter === 'paused' && t.status !== 'paused' && t.status !== 'policy_paused') return false;
      if (filter === 'completed' && t.status !== 'completed' && t.status !== 'seeding') return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.infoHash.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [snapshot.tasks, filter, query]);

  const isWifi = snapshot.policy.simulatedNetwork === 'wifi';
  const policyBlocked =
    (snapshot.policy.wifiOnly && !isWifi) ||
    (snapshot.policy.chargingOnly && !snapshot.policy.simulatedCharging);

  return (
    <div className="space-y-6">
      {/* Top Hero Telemetry & Speed Trend Strip */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#171A23] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07]">
            <div className="p-5">
              <div className="text-xs text-[#9AA0AC]">总下行速率</div>
              <div className="mt-2 text-xl sm:text-2xl font-semibold font-mono-tabular text-[#E3E2E6]">
                {formatSpeed(snapshot.totalDownloadBps)}
              </div>
              <div className="mt-1 text-xs font-mono-tabular text-[#8E94A0]">
                {snapshot.policy.globalDownloadLimitKbps > 0
                  ? `上限 ${snapshot.policy.globalDownloadLimitKbps} KB/s`
                  : '无全局限速'}
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-[#9AA0AC]">总上行速率</div>
              <div className="mt-2 text-xl sm:text-2xl font-semibold font-mono-tabular text-[#E3E2E6]">
                {formatSpeed(snapshot.totalUploadBps)}
              </div>
              <div className="mt-1 text-xs font-mono-tabular text-[#8E94A0]">
                {snapshot.policy.globalUploadLimitKbps > 0
                  ? `上限 ${snapshot.policy.globalUploadLimitKbps} KB/s`
                  : '无全局限速'}
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-[#9AA0AC]">并发队列槽位</div>
              <div className="mt-2 text-xl sm:text-2xl font-semibold font-mono-tabular text-[#A8C7FA]">
                {snapshot.activeCount} / {snapshot.policy.maxConcurrentDownloads}
              </div>
              <div className="mt-1 text-xs font-mono-tabular text-[#8E94A0]">
                排队等待 {snapshot.queuedCount} 项
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs text-[#9AA0AC]">FastResume 快照</div>
              <div className="mt-2 text-xl sm:text-2xl font-semibold font-mono-tabular text-[#E3E2E6]">
                {snapshot.fastResumeCount}
              </div>
              <div className="mt-1 text-xs text-[#8E94A0]">
                {snapshot.policy.fastResumeEnabled ? '断点位图持久化开启' : '未启用持久化'}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-white/[0.07] px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#9AA0AC]">
              <span>实时下行速率曲线</span>
              <span className="inline-flex items-center gap-1.5 font-mono-tabular">
                {isWifi ? (
                  <Wifi className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                )}
                <span>{isWifi ? 'Wi-Fi' : '5G 蜂窝'}</span>
                {snapshot.policy.simulatedCharging && (
                  <>
                    <span aria-hidden="true">·</span>
                    <BatteryCharging className="h-3.5 w-3.5 text-[#A8C7FA]" aria-hidden="true" />
                    <span>充电中</span>
                  </>
                )}
              </span>
            </div>
            <div className="mt-2">
              <SpeedSparkline samples={snapshot.speedHistory} />
            </div>
          </div>
        </div>
      </section>

      {policyBlocked && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#FDE68A]">
          <span>
            当前环境触发传输保护策略（{snapshot.policy.wifiOnly && !isWifi ? '非 Wi-Fi 网络' : '未接通电源'}），活跃磁力任务已安全挂起并保存断点。
          </span>
        </div>
      )}

      {/* Toolbar: Segmented Filter + Search + Batch Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#171A23] p-1">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#A8C7FA]/15 text-[#A8C7FA]'
                    : 'text-[#9AA0AC] hover:text-[#E3E2E6]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E94A0]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务名称或 InfoHash..."
              aria-label="搜索任务"
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#171A23] pl-9 pr-3 text-sm text-[#E3E2E6] placeholder:text-[#6B7280] focus:border-[#A8C7FA] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={onPauseAll}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#171A23] px-3.5 text-xs font-medium text-[#C4C6D0] hover:bg-[#1E222E] hover:text-[#E3E2E6] whitespace-nowrap transition-colors"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            <span>全部暂停</span>
          </button>

          <button
            type="button"
            onClick={onResumeAll}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#171A23] px-3.5 text-xs font-medium text-[#A8C7FA] hover:bg-[#1E222E] whitespace-nowrap transition-colors"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>全部继续</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#171A23] px-6 py-16 text-center">
          <p className="font-display text-base font-medium text-[#E3E2E6]">
            {snapshot.tasks.length === 0 ? '下载队列为空' : '未匹配到符合筛选条件的任务'}
          </p>
          <p className="mt-1.5 text-sm text-[#8E94A0]">
            粘贴磁力链接即可由 librqbit 引擎解析文件列表并开启断点续传。
          </p>
          {snapshot.tasks.length === 0 && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#A8C7FA] px-5 text-sm font-medium text-[#062E6F] hover:bg-[#BED6FC] transition-colors"
            >
              添加首个磁力任务
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-[#171A23] overflow-hidden">
          {filteredTasks.map((task) => {
            const pct = formatPercent(task.downloadedBytes, task.selectedBytes);
            const meta = STATUS_META[task.status];
            const selectedCount = task.files.filter((f) => f.selected).length;

            return (
              <div
                key={task.id}
                className="group px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onInspectTask(task)}
                    className="min-w-0 text-left flex-1 focus-visible:outline-2 focus-visible:outline-[#A8C7FA] rounded"
                  >
                    <div className="flex items-center gap-2.5">
                      <StatusIcon status={task.status} />
                      <h3 className="truncate font-display text-sm sm:text-base font-medium text-[#E3E2E6] group-hover:text-[#A8C7FA] transition-colors">
                        {task.name}
                      </h3>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#9AA0AC] font-mono-tabular">
                      <span className={meta.colorClass}>{meta.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatBytes(task.downloadedBytes)} / {formatBytes(task.selectedBytes)} ({pct.toFixed(1)}%)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        文件 {selectedCount}/{task.files.length}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{task.peers.length} Peers</span>
                      {task.downloadLimitKbps > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>限速 {task.downloadLimitKbps} KB/s</span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Right metrics & action buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right font-mono-tabular">
                      <div className="text-sm font-medium text-[#E3E2E6]">
                        {task.status === 'downloading'
                          ? formatSpeed(task.downloadBps)
                          : task.status === 'completed'
                            ? '校验完成'
                            : '--'}
                      </div>
                      <div className="text-xs text-[#8E94A0]">
                        {task.status === 'downloading'
                          ? `剩余 ${formatEta(task.etaSeconds)}`
                          : `Hash ${task.infoHash.slice(0, 8)}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {task.status === 'queued' && (
                        <button
                          type="button"
                          onClick={() => onPromoteTask(task.id)}
                          title="优先调度此任务"
                          aria-label="优先调度此任务"
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#9AA0AC] hover:bg-white/[0.06] hover:text-[#E3E2E6] transition-colors"
                        >
                          <ArrowUpToLine className="h-4 w-4" />
                        </button>
                      )}

                      {task.status === 'downloading' ? (
                        <button
                          type="button"
                          onClick={() => onPauseTask(task.id)}
                          title="暂停下载"
                          aria-label="暂停下载"
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#E3E2E6] hover:bg-white/[0.06] transition-colors"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      ) : task.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => onResumeTask(task.id)}
                          title="继续下载"
                          aria-label="继续下载"
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#A8C7FA] hover:bg-white/[0.06] transition-colors"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onInspectTask(task)}
                        title="文件选择与分片详情"
                        aria-label="文件选择与分片详情"
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#9AA0AC] hover:bg-white/[0.06] hover:text-[#E3E2E6] transition-colors"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Slim Material You Progress Track */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className={`h-full transition-all duration-300 ${
                      task.status === 'completed'
                        ? 'bg-[#22C55E]'
                        : task.status === 'paused' || task.status === 'policy_paused'
                          ? 'bg-[#9CA3AF]/60'
                          : 'bg-[#A8C7FA]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
