import { Plus } from 'lucide-react';

export type ActiveTab = 'queue' | 'policy' | 'android' | 'source';

interface TopNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenAddModal: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'queue', label: '下载队列' },
  { id: 'policy', label: '传输策略' },
  { id: 'android', label: '安卓通知预览' },
  { id: 'source', label: '原生工程源码' },
];

export function TopNav({ activeTab, onSelectTab, onOpenAddModal }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0F1117]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('queue')}
          className="font-display text-lg font-semibold tracking-tight text-[#E3E2E6] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#A8C7FA] rounded"
        >
          MagnetPulse
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#A8C7FA] rounded ${
                  isActive ? 'text-[#E3E2E6]' : 'text-[#9AA0AC] hover:text-[#E3E2E6]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-[2px] bg-[#A8C7FA]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA action */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#A8C7FA] px-4 text-sm font-medium text-[#062E6F] whitespace-nowrap shrink-0 transition-transform duration-150 hover:bg-[#BED6FC] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A8C7FA]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>添加磁力任务</span>
        </button>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        className="flex md:hidden items-center justify-around border-t border-white/[0.06] px-2 h-11"
        aria-label="移动端导航"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive ? 'text-[#A8C7FA]' : 'text-[#9AA0AC]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
