import { useState } from 'react';
import { Check, Link2, Loader2, X } from 'lucide-react';
import type { ParsedMagnetPreview } from '../types/torrent';
import { formatBytes } from '../utils/format';

interface AddMagnetModalProps {
  open: boolean;
  onClose: () => void;
  onEnqueue: (payload: {
    magnetUri: string;
    selectedFileIndices: number[];
    downloadLimitKbps: number;
    startPaused: boolean;
  }) => Promise<string | null>;
}

const MAGNET_PRESETS = [
  {
    label: 'Fedora Workstation 41 ISO',
    uri: 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Fedora-Workstation-Live-x86_64-41&xl=2415919104&tr=https%3A%2F%2Ftorrent.fedoraproject.org%2Fannounce',
  },
  {
    label: 'LibreOffice 24.8 离线包',
    uri: 'magnet:?xt=urn:btih:8a23f4910bc81a44e2390c11b0294810ca21e442&dn=LibreOffice_24.8_MultiPlatform_Archive&xl=1384120320&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
  },
  {
    label: 'Rustacean OS 实验镜像',
    uri: 'magnet:?xt=urn:btih:5f0e21948a0c3e71b24098f2e1102a74b8c30129&dn=Rustacean-OS-2026.11-aarch64&xl=894120400&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce',
  },
];

export function AddMagnetModal({ open, onClose, onEnqueue }: AddMagnetModalProps) {
  const [magnetUri, setMagnetUri] = useState('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<ParsedMagnetPreview | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [downloadLimitKbps, setDownloadLimitKbps] = useState<number>(0);
  const [startPaused, setStartPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleParse = async (uriToParse?: string) => {
    const target = (uriToParse ?? magnetUri).trim();
    if (!target) {
      setError('请粘贴有效的 magnet:? 链接');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const res = await fetch('/api/magnet/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetUri: target }),
      });
      const data = (await res.json()) as ParsedMagnetPreview;
      if (!res.ok || !data.valid) {
        setPreview(null);
        setError(data.error || '磁力链接解析失败');
      } else {
        setPreview(data);
        setSelectedIndices(data.files.map((f) => f.index));
      }
    } catch {
      setError('网络请求异常，无法连接解析服务');
    } finally {
      setParsing(false);
    }
  };

  const toggleFile = (index: number) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSubmit = async () => {
    const uri = (preview?.magnetUri ?? magnetUri).trim();
    if (!uri) {
      setError('请输入磁力链接');
      return;
    }
    if (preview && selectedIndices.length === 0) {
      setError('请至少勾选一个需要下载的文件');
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await onEnqueue({
      magnetUri: uri,
      selectedFileIndices: selectedIndices,
      downloadLimitKbps,
      startPaused,
    });
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setMagnetUri('');
    setPreview(null);
    setSelectedIndices([]);
    setDownloadLimitKbps(0);
    setStartPaused(false);
    onClose();
  };

  const selectedSize = preview
    ? preview.files
        .filter((f) => selectedIndices.includes(f.index))
        .reduce((s, f) => s + f.sizeBytes, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-magnet-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#171A23] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <h2 id="add-magnet-title" className="font-display text-lg font-semibold text-[#E3E2E6]">
            添加磁力链接任务
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#9AA0AC] hover:bg-white/[0.06] hover:text-[#E3E2E6] transition-colors"
            aria-label="关闭窗口"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Magnet URI input */}
          <div>
            <label htmlFor="magnet-uri-input" className="block text-sm font-medium text-[#C4C6D0] mb-2">
              磁力链接 (Magnet URI)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <textarea
                id="magnet-uri-input"
                rows={3}
                value={magnetUri}
                onChange={(e) => setMagnetUri(e.target.value)}
                placeholder="magnet:?xt=urn:btih:..."
                className="w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 py-2.5 text-sm font-mono-tabular text-[#E3E2E6] placeholder:text-[#5F6673] focus:border-[#A8C7FA] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleParse()}
                disabled={parsing}
                className="inline-flex h-11 sm:h-auto sm:w-32 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#1E222E] px-4 text-sm font-medium text-[#E3E2E6] hover:bg-[#262B3A] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                <span>解析元数据</span>
              </button>
            </div>

            {/* Quick test presets */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#8E94A0]">测试链接：</span>
              {MAGNET_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setMagnetUri(preset.uri);
                    void handleParse(preset.uri);
                  }}
                  className="rounded-lg border border-white/[0.08] bg-[#1E222E] px-2.5 py-1 text-xs text-[#C4C6D0] hover:border-[#A8C7FA]/50 hover:text-[#E3E2E6] transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
              {error}
            </div>
          )}

          {/* Parsed metadata preview & selective file selection */}
          {preview && (
            <div className="space-y-4 border-t border-white/[0.08] pt-4">
              <div>
                <div className="text-sm font-semibold text-[#E3E2E6] truncate">{preview.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#9AA0AC] font-mono-tabular">
                  <span>InfoHash {preview.infoHash.slice(0, 12)}...</span>
                  <span aria-hidden="true">·</span>
                  <span>总体积 {formatBytes(preview.totalBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>已选 {formatBytes(selectedSize)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preview.trackers.length} 个 Tracker</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#C4C6D0]">
                    选择性文件下载 (librqbit only_files)
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedIndices(preview.files.map((f) => f.index))}
                      className="text-[#A8C7FA] hover:underline"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIndices([])}
                      className="text-[#9AA0AC] hover:text-[#E3E2E6]"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-[#0F1117]">
                  {preview.files.map((file) => {
                    const checked = selectedIndices.includes(file.index);
                    return (
                      <button
                        key={file.index}
                        type="button"
                        onClick={() => toggleFile(file.index)}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                              checked
                                ? 'border-[#A8C7FA] bg-[#A8C7FA] text-[#062E6F]'
                                : 'border-white/25 bg-transparent'
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                          </span>
                          <span className="truncate text-sm text-[#E3E2E6]">{file.path}</span>
                        </div>
                        <span className="shrink-0 text-xs font-mono-tabular text-[#9AA0AC]">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="task-limit-input" className="block text-xs font-medium text-[#C4C6D0] mb-1.5">
                    单任务下载限速 (KB/s，0 为不限速)
                  </label>
                  <input
                    id="task-limit-input"
                    type="number"
                    min={0}
                    step={256}
                    value={downloadLimitKbps}
                    onChange={(e) => setDownloadLimitKbps(Math.max(0, Number(e.target.value)))}
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setStartPaused((v) => !v)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 text-sm text-[#E3E2E6] hover:border-white/20 transition-colors"
                  >
                    <span>添加后暂不开始</span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        startPaused
                          ? 'border-[#A8C7FA] bg-[#A8C7FA] text-[#062E6F]'
                          : 'border-white/25'
                      }`}
                    >
                      {startPaused && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-sm font-medium text-[#C4C6D0] hover:bg-white/[0.06] transition-colors whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !magnetUri.trim()}
            className="h-10 rounded-xl bg-[#A8C7FA] px-5 text-sm font-medium text-[#062E6F] hover:bg-[#BED6FC] disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            {submitting ? '正在入队...' : '加入下载队列'}
          </button>
        </div>
      </div>
    </div>
  );
}
