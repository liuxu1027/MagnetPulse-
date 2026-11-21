import { useEffect, useState } from 'react';
import { Check, Pause, Play, Trash2, X } from 'lucide-react';
import type { FilePriority, TorrentTask } from '../types/torrent';
import { formatBytes, formatEta, formatPercent, formatSpeed, STATUS_META } from '../utils/format';

interface TaskInspectorDrawerProps {
  task: TorrentTask | null;
  onClose: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateFiles: (
    id: string,
    files: Array<{ index: number; selected: boolean; priority: FilePriority }>
  ) => Promise<void>;
  onUpdateLimits: (id: string, downKbps: number, upKbps: number) => Promise<void>;
}

type InspectorTab = 'files' | 'peers' | 'pieces';

export function TaskInspectorDrawer({
  task,
  onClose,
  onPause,
  onResume,
  onRemove,
  onUpdateFiles,
  onUpdateLimits,
}: TaskInspectorDrawerProps) {
  const [tab, setTab] = useState<InspectorTab>('files');
  const [downLimit, setDownLimit] = useState(0);
  const [upLimit, setUpLimit] = useState(0);
  const [savingLimits, setSavingLimits] = useState(false);

  useEffect(() => {
    if (task) {
      setDownLimit(task.downloadLimitKbps);
      setUpLimit(task.uploadLimitKbps);
    }
  }, [task?.id]);

  if (!task) return null;

  const pct = formatPercent(task.downloadedBytes, task.selectedBytes);
  const meta = STATUS_META[task.status];

  const handleToggleFile = async (index: number, currentSelected: boolean, priority: FilePriority) => {
    const nextFiles = task.files.map((f) => ({
      index: f.index,
      selected: f.index === index ? !currentSelected : f.selected,
      priority: f.index === index ? priority : f.priority,
    }));
    await onUpdateFiles(task.id, nextFiles);
  };

  const handleChangePriority = async (index: number, priority: FilePriority) => {
    const nextFiles = task.files.map((f) => ({
      index: f.index,
      selected: f.selected,
      priority: f.index === index ? priority : f.priority,
    }));
    await onUpdateFiles(task.id, nextFiles);
  };

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    await onUpdateLimits(task.id, downLimit, upLimit);
    setSavingLimits(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="任务详情抽屉"
    >
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-white/[0.08] bg-[#171A23] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[#E3E2E6] truncate">
              {task.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#9AA0AC] font-mono-tabular">
              <span className={meta.colorClass}>{meta.label}</span>
              <span aria-hidden="true">·</span>
              <span>{pct.toFixed(1)}%</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatBytes(task.downloadedBytes)} / {formatBytes(task.selectedBytes)}
              </span>
              <span aria-hidden="true">·</span>
              <span>Hash {task.infoHash.slice(0, 10)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {task.status === 'downloading' ? (
              <button
                type="button"
                onClick={() => onPause(task.id)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-[#E3E2E6] hover:bg-white/[0.06]"
                aria-label="暂停任务"
              >
                <Pause className="h-4 w-4" />
              </button>
            ) : task.status !== 'completed' ? (
              <button
                type="button"
                onClick={() => onResume(task.id)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-[#A8C7FA] hover:bg-white/[0.06]"
                aria-label="继续任务"
              >
                <Play className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onRemove(task.id);
                onClose();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-[#EF4444] hover:bg-[#EF4444]/10"
              aria-label="移除任务"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#9AA0AC] hover:bg-white/[0.06] hover:text-[#E3E2E6]"
              aria-label="关闭详情"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 border-b border-white/[0.08] px-6 py-2.5">
          {[
            { id: 'files' as const, label: `文件选择 (${task.files.filter((f) => f.selected).length}/${task.files.length})` },
            { id: 'peers' as const, label: `Peer 与 Tracker (${task.peers.length})` },
            { id: 'pieces' as const, label: 'FastResume 位图与限速' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-[#A8C7FA]/15 text-[#A8C7FA]'
                  : 'text-[#9AA0AC] hover:text-[#E3E2E6]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'files' && (
            <div className="space-y-3">
              <p className="text-xs text-[#9AA0AC]">
                实时调用 <span className="font-mono-tabular text-[#C4C6D0]">update_only_files</span> 更新下载掩码，取消勾选的文件会立即停止拉取分片。
              </p>
              <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#0F1117]">
                {task.files.map((file) => {
                  const filePct = formatPercent(file.downloadedBytes, file.sizeBytes);
                  return (
                    <div key={file.index} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleFile(file.index, file.selected, file.priority)}
                          className="flex items-center gap-3 min-w-0 text-left"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                              file.selected
                                ? 'border-[#A8C7FA] bg-[#A8C7FA] text-[#062E6F]'
                                : 'border-white/25'
                            }`}
                          >
                            {file.selected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                          </span>
                          <span
                            className={`truncate text-sm ${
                              file.selected ? 'text-[#E3E2E6]' : 'text-[#6B7280] line-through'
                            }`}
                          >
                            {file.path}
                          </span>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            aria-label={`设置 ${file.path} 优先级`}
                            value={file.priority}
                            onChange={(e) =>
                              handleChangePriority(file.index, e.target.value as FilePriority)
                            }
                            className="h-7 rounded-lg border border-white/[0.1] bg-[#171A23] px-2 text-xs text-[#C4C6D0] focus:border-[#A8C7FA] focus:outline-none"
                          >
                            <option value="high">高优先级</option>
                            <option value="normal">标准</option>
                            <option value="low">低优先级</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pl-8">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className="h-full bg-[#A8C7FA] transition-all duration-300"
                            style={{ width: `${filePct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono-tabular text-[#9AA0AC] w-36 text-right">
                          {formatBytes(file.downloadedBytes)} / {formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'peers' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-[#E3E2E6] mb-2.5">已连接 Peer 节点</h3>
                {task.peers.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#0F1117] px-4 py-6 text-center text-sm text-[#8E94A0]">
                    当前处于非活跃传输状态，无活跃 Peer 会话。
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0F1117]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/[0.08] text-[#8E94A0]">
                        <tr>
                          <th className="px-3.5 py-2.5 font-medium">节点地址</th>
                          <th className="px-3.5 py-2.5 font-medium">客户端</th>
                          <th className="px-3.5 py-2.5 font-medium text-right">下行</th>
                          <th className="px-3.5 py-2.5 font-medium text-right">上行</th>
                          <th className="px-3.5 py-2.5 font-medium text-right">进度</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] font-mono-tabular">
                        {task.peers.map((peer) => (
                          <tr key={peer.id} className="hover:bg-white/[0.02]">
                            <td className="px-3.5 py-2.5 text-[#E3E2E6]">
                              {peer.ip}:{peer.port} ({peer.country})
                            </td>
                            <td className="px-3.5 py-2.5 text-[#C4C6D0]">{peer.client}</td>
                            <td className="px-3.5 py-2.5 text-right text-[#22C55E]">
                              {formatSpeed(peer.downloadBps)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-[#A8C7FA]">
                              {formatSpeed(peer.uploadBps)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-[#9AA0AC]">
                              {Math.round(peer.progress * 100)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#E3E2E6] mb-2.5">Tracker 服务器列表</h3>
                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#0F1117]">
                  {task.trackers.map((tr) => (
                    <div key={tr.url} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                      <span className="truncate font-mono-tabular text-[#C4C6D0]">{tr.url}</span>
                      <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[#9AA0AC]">
                        <span>{tr.status === 'working' ? '正常' : '空闲'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tr.peers} Peers</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'pieces' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-[#E3E2E6]">
                    分片位图 (FastResume Bitfield)
                  </h3>
                  <span className="text-xs font-mono-tabular text-[#9AA0AC]">
                    {task.completedPieces.filter(Boolean).length} / {task.pieceCount} 分片 · 每片 {formatBytes(task.pieceSizeBytes)}
                  </span>
                </div>
                <div className="grid grid-cols-16 gap-1 rounded-xl border border-white/[0.08] bg-[#0F1117] p-3.5">
                  {task.completedPieces.map((done, i) => (
                    <div
                      key={i}
                      title={`Piece #${i}: ${done ? '已校验落盘' : '待下载'}`}
                      className={`h-3 rounded-[3px] transition-colors ${
                        done ? 'bg-[#A8C7FA]' : 'bg-white/[0.08]'
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#8E94A0] font-mono-tabular">
                  <span>预计剩余：{formatEta(task.etaSeconds)}</span>
                  <span aria-hidden="true">·</span>
                  <span>最近持久化：{new Date(task.fastResumeSavedAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="border-t border-white/[0.08] pt-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#E3E2E6]">单任务带宽限速</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="drawer-down-limit" className="block text-xs text-[#9AA0AC] mb-1.5">
                      下行限速 (KB/s，0 为无限制)
                    </label>
                    <input
                      id="drawer-down-limit"
                      type="number"
                      min={0}
                      step={256}
                      value={downLimit}
                      onChange={(e) => setDownLimit(Math.max(0, Number(e.target.value)))}
                      className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="drawer-up-limit" className="block text-xs text-[#9AA0AC] mb-1.5">
                      上行限速 (KB/s，0 为无限制)
                    </label>
                    <input
                      id="drawer-up-limit"
                      type="number"
                      min={0}
                      step={128}
                      value={upLimit}
                      onChange={(e) => setUpLimit(Math.max(0, Number(e.target.value)))}
                      className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveLimits}
                  disabled={savingLimits}
                  className="h-10 rounded-xl bg-[#A8C7FA] px-4 text-sm font-medium text-[#062E6F] hover:bg-[#BED6FC] disabled:opacity-50 transition-colors"
                >
                  {savingLimits ? '正在应用...' : '应用单任务限速'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
