import { useState } from 'react';
import { BatteryCharging, CheckCircle2, Globe, Loader2, Server, Wifi, WifiOff } from 'lucide-react';
import type { EnginePolicy } from '../types/torrent';

interface PolicyCenterViewProps {
  policy: EnginePolicy;
  onUpdatePolicy: (partial: Partial<EnginePolicy>) => Promise<void>;
}

export function PolicyCenterView({ policy, onUpdatePolicy }: PolicyCenterViewProps) {
  const [concurrency, setConcurrency] = useState(policy.maxConcurrentDownloads);
  const [globalDown, setGlobalDown] = useState(policy.globalDownloadLimitKbps);
  const [globalUp, setGlobalUp] = useState(policy.globalUploadLimitKbps);
  const [savePath, setSavePath] = useState(policy.savePath);
  const [remoteUrl, setRemoteUrl] = useState(policy.remoteRqbitUrl || 'http://127.0.0.1:3030');
  const [saving, setSaving] = useState(false);
  const [testingNode, setTestingNode] = useState(false);
  const [nodeStatus, setNodeStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSaveRates = async () => {
    setSaving(true);
    await onUpdatePolicy({
      maxConcurrentDownloads: concurrency,
      globalDownloadLimitKbps: globalDown,
      globalUploadLimitKbps: globalUp,
      savePath,
    });
    setSaving(false);
  };

  const handleTestRqbitNode = async () => {
    setTestingNode(true);
    setNodeStatus(null);
    try {
      const res = await fetch('/api/rqbit-bridge/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setNodeStatus({ ok: true, msg: `已连接本地 rqbit 服务，检测到 ${data.torrentsCount} 个托管任务` });
        await onUpdatePolicy({ remoteRqbitUrl: remoteUrl });
      } else {
        setNodeStatus({ ok: false, msg: data.error || '节点连接失败' });
      }
    } catch {
      setNodeStatus({ ok: false, msg: '无法连接到目标 rqbit HTTP 接口' });
    } finally {
      setTestingNode(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Core Concurrency & Rate Limits */}
      <div className="lg:col-span-7 space-y-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#171A23] p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#E3E2E6]">
              多任务并发与带宽限制
            </h2>
            <p className="mt-1 text-xs text-[#9AA0AC]">
              对应 librqbit <span className="font-mono-tabular text-[#C4C6D0]">SessionOptions.ratelimits</span> 与调度队列槽位控制。
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <label htmlFor="concurrency-range" className="text-[#E3E2E6]">
                  最大并发下载任务数
                </label>
                <span className="font-mono-tabular text-[#A8C7FA] font-semibold">
                  {concurrency} 个并发槽位
                </span>
              </div>
              <input
                id="concurrency-range"
                type="range"
                min={1}
                max={6}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full accent-[#A8C7FA]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="global-down" className="block text-xs text-[#9AA0AC] mb-1.5">
                  全局下行限速 (KB/s，0 为无限制)
                </label>
                <input
                  id="global-down"
                  type="number"
                  min={0}
                  step={512}
                  value={globalDown}
                  onChange={(e) => setGlobalDown(Math.max(0, Number(e.target.value)))}
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="global-up" className="block text-xs text-[#9AA0AC] mb-1.5">
                  全局上行限速 (KB/s，0 为无限制)
                </label>
                <input
                  id="global-up"
                  type="number"
                  min={0}
                  step={256}
                  value={globalUp}
                  onChange={(e) => setGlobalUp(Math.max(0, Number(e.target.value)))}
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="save-path" className="block text-xs text-[#9AA0AC] mb-1.5">
                默认存储路径
              </label>
              <input
                id="save-path"
                type="text"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveRates}
              disabled={saving}
              className="h-10 rounded-xl bg-[#A8C7FA] px-5 text-sm font-medium text-[#062E6F] hover:bg-[#BED6FC] disabled:opacity-50 transition-colors"
            >
              {saving ? '正在保存...' : '应用队列与速率设置'}
            </button>
          </div>
        </section>

        {/* Remote rqbit HTTP API Bridge */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#171A23] p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#E3E2E6]">
                本地 rqbit HTTP 节点直连桥接
              </h2>
              <p className="mt-1 text-xs text-[#9AA0AC]">
                若您在电脑或局域网运行了 <span className="font-mono-tabular text-[#C4C6D0]">rqbit server start</span>，可在此测试并绑定 HTTP API 地址。
              </p>
            </div>
            <Server className="h-5 w-5 text-[#9AA0AC] shrink-0" aria-hidden="true" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="http://127.0.0.1:3030"
              aria-label="rqbit 服务地址"
              className="h-10 flex-1 rounded-xl border border-white/[0.1] bg-[#0F1117] px-3.5 text-sm font-mono-tabular text-[#E3E2E6] focus:border-[#A8C7FA] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleTestRqbitNode}
              disabled={testingNode}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#1E222E] px-4 text-sm font-medium text-[#E3E2E6] hover:bg-[#262B3A] whitespace-nowrap"
            >
              {testingNode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              <span>测试节点连通性</span>
            </button>
          </div>

          {nodeStatus && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                nodeStatus.ok
                  ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]'
                  : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]'
              }`}
            >
              {nodeStatus.msg}
            </div>
          )}
        </section>
      </div>

      {/* Right Column: Network & Battery Guard + Live Simulator */}
      <div className="lg:col-span-5 space-y-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#171A23] p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#E3E2E6]">
              移动端网络与电量保护策略
            </h2>
            <p className="mt-1 text-xs text-[#9AA0AC]">
              安卓端由 <span className="font-mono-tabular text-[#C4C6D0]">NetworkPolicyMonitor</span> 实时监听系统广播并驱动引擎自动挂起/续传。
            </p>
          </div>

          <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-[#0F1117]">
            <button
              type="button"
              onClick={() => onUpdatePolicy({ wifiOnly: !policy.wifiOnly })}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02]"
            >
              <div>
                <div className="text-sm font-medium text-[#E3E2E6]">仅 Wi-Fi / 以太网下传输</div>
                <div className="text-xs text-[#8E94A0] mt-0.5">切换为移动蜂窝网络时自动暂停活跃任务</div>
              </div>
              <span
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  policy.wifiOnly ? 'bg-[#A8C7FA]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-[#0F1117] transition-transform ${
                    policy.wifiOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onUpdatePolicy({ chargingOnly: !policy.chargingOnly })}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02]"
            >
              <div>
                <div className="text-sm font-medium text-[#E3E2E6]">仅连接电源充电时下载</div>
                <div className="text-xs text-[#8E94A0] mt-0.5">拔掉充电器后暂停大流量分片写入以节省电量</div>
              </div>
              <span
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  policy.chargingOnly ? 'bg-[#A8C7FA]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-[#0F1117] transition-transform ${
                    policy.chargingOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onUpdatePolicy({ fastResumeEnabled: !policy.fastResumeEnabled })}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02]"
            >
              <div>
                <div className="text-sm font-medium text-[#E3E2E6]">FastResume 断点快速恢复</div>
                <div className="text-xs text-[#8E94A0] mt-0.5">保存 JSON 分片位图，重启后跳过全盘哈希校验</div>
              </div>
              <span
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  policy.fastResumeEnabled ? 'bg-[#A8C7FA]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-[#0F1117] transition-transform ${
                    policy.fastResumeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Interactive Environment Simulator */}
          <div className="border-t border-white/[0.08] pt-4 space-y-3">
            <div className="text-xs font-medium text-[#C4C6D0]">
              安卓系统环境模拟（实时验证策略触发）
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onUpdatePolicy({
                    simulatedNetwork: policy.simulatedNetwork === 'wifi' ? 'cellular' : 'wifi',
                  })
                }
                className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-xs font-medium transition-colors ${
                  policy.simulatedNetwork === 'wifi'
                    ? 'border-[#22C55E]/40 bg-[#22C55E]/10 text-[#86EFAC]'
                    : 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FDE68A]'
                }`}
              >
                {policy.simulatedNetwork === 'wifi' ? (
                  <>
                    <Wifi className="h-4 w-4" aria-hidden="true" />
                    <span>当前：Wi-Fi</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4" aria-hidden="true" />
                    <span>当前：5G 蜂窝</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onUpdatePolicy({ simulatedCharging: !policy.simulatedCharging })}
                className={`flex items-center justify-center gap-2 h-11 rounded-xl border text-xs font-medium transition-colors ${
                  policy.simulatedCharging
                    ? 'border-[#A8C7FA]/40 bg-[#A8C7FA]/10 text-[#A8C7FA]'
                    : 'border-white/[0.12] bg-[#0F1117] text-[#C4C6D0]'
                }`}
              >
                {policy.simulatedCharging ? (
                  <>
                    <BatteryCharging className="h-4 w-4" aria-hidden="true" />
                    <span>当前：充电中</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>当前：电池供电</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
