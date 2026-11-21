import { useCallback, useEffect, useState } from 'react';
import type {
  EnginePolicy,
  EngineStateSnapshot,
  FilePriority,
  TorrentTask,
} from './types/torrent';
import { AddMagnetModal } from './components/AddMagnetModal';
import { AndroidNotificationPreview } from './components/AndroidNotificationPreview';
import { DownloadQueueView } from './components/DownloadQueueView';
import { NativeSourceExplorer } from './components/NativeSourceExplorer';
import { PolicyCenterView } from './components/PolicyCenterView';
import { TaskInspectorDrawer } from './components/TaskInspectorDrawer';
import { TopNav, type ActiveTab } from './components/TopNav';

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineStateSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('无法读取引擎状态');
      const data = (await res.json()) as EngineStateSnapshot;
      setSnapshot(data);
      setLoadError(null);
    } catch {
      setLoadError('无法连接 MagnetPulse 后端服务');
    }
  }, []);

  useEffect(() => {
    void fetchState();
    const timer = setInterval(() => {
      void fetchState();
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchState]);

  const handleEnqueue = async (payload: {
    magnetUri: string;
    selectedFileIndices: number[];
    downloadLimitKbps: number;
    startPaused: boolean;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return data.error || '添加任务失败';
      }
      if (data.snapshot) {
        setSnapshot(data.snapshot);
      } else {
        await fetchState();
      }
      return null;
    } catch {
      return '网络错误，无法提交任务';
    }
  };

  const handlePauseTask = async (id: string) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}/pause`, { method: 'POST' });
    if (res.ok) setSnapshot(await res.json());
  };

  const handleResumeTask = async (id: string) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}/resume`, { method: 'POST' });
    if (res.ok) setSnapshot(await res.json());
  };

  const handlePromoteTask = async (id: string) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}/promote`, { method: 'POST' });
    if (res.ok) setSnapshot(await res.json());
  };

  const handleRemoveTask = async (id: string) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setSnapshot(await res.json());
  };

  const handleUpdateFiles = async (
    id: string,
    files: Array<{ index: number; selected: boolean; priority: FilePriority }>
  ) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.snapshot) setSnapshot(data.snapshot);
    }
  };

  const handleUpdateLimits = async (id: string, downKbps: number, upKbps: number) => {
    const res = await fetch(`/api/torrents/${encodeURIComponent(id)}/limits`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLimitKbps: downKbps, uploadLimitKbps: upKbps }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.snapshot) setSnapshot(data.snapshot);
    }
  };

  const handleUpdatePolicy = async (partial: Partial<EnginePolicy>) => {
    const res = await fetch('/api/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.snapshot) setSnapshot(data.snapshot);
    }
  };

  const handleNotificationAction = async (action: 'pause_all' | 'resume_all' | 'mark_read') => {
    const res = await fetch('/api/notifications/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setSnapshot(await res.json());
  };

  const inspectedTask: TorrentTask | null =
    snapshot?.tasks.find((t) => t.id === inspectedTaskId) ?? null;

  return (
    <div className="min-h-screen bg-[#0F1117] text-[#E3E2E6]">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddModal={() => setAddModalOpen(true)}
      />

      <main className="mx-auto max-w-[1360px] px-4 sm:px-6 py-6 sm:py-8">
        {loadError && (
          <div className="mb-6 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
            {loadError}
          </div>
        )}

        {!snapshot ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl border border-white/[0.06] bg-[#171A23] animate-pulse" />
            <div className="h-64 rounded-2xl border border-white/[0.06] bg-[#171A23] animate-pulse" />
          </div>
        ) : (
          <>
            {activeTab === 'queue' && (
              <DownloadQueueView
                snapshot={snapshot}
                onPauseTask={handlePauseTask}
                onResumeTask={handleResumeTask}
                onPromoteTask={handlePromoteTask}
                onPauseAll={() => handleNotificationAction('pause_all')}
                onResumeAll={() => handleNotificationAction('resume_all')}
                onInspectTask={(task) => setInspectedTaskId(task.id)}
                onOpenAddModal={() => setAddModalOpen(true)}
              />
            )}

            {activeTab === 'policy' && (
              <PolicyCenterView
                policy={snapshot.policy}
                onUpdatePolicy={handleUpdatePolicy}
              />
            )}

            {activeTab === 'android' && (
              <AndroidNotificationPreview
                snapshot={snapshot}
                onNotificationAction={handleNotificationAction}
                onPauseTask={handlePauseTask}
                onResumeTask={handleResumeTask}
              />
            )}

            {activeTab === 'source' && <NativeSourceExplorer />}
          </>
        )}
      </main>

      <AddMagnetModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onEnqueue={handleEnqueue}
      />

      <TaskInspectorDrawer
        task={inspectedTask}
        onClose={() => setInspectedTaskId(null)}
        onPause={handlePauseTask}
        onResume={handleResumeTask}
        onRemove={handleRemoveTask}
        onUpdateFiles={handleUpdateFiles}
        onUpdateLimits={handleUpdateLimits}
      />
    </div>
  );
}
