import { List, MapPinPlus } from 'lucide-react';
import type { ActiveTab } from '../types/mosque';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

const NAV_ITEMS: { id: Exclude<ActiveTab, 'users'>; label: string; icon: typeof MapPinPlus }[] = [
  { id: 'add', label: 'إضافة', icon: MapPinPlus },
  { id: 'list', label: 'القائمة', icon: List },
];

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E5E2D9] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-5xl mx-auto h-14 grid grid-cols-2 items-center">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative h-full min-h-[48px] flex flex-col items-center justify-center gap-0.5 active:bg-[#0F4C3A]/5 transition-colors ${
                isActive
                  ? 'text-[#0F4C3A] font-bold'
                  : 'text-[#5A6561] hover:text-[#1A2421] font-medium'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 w-12 h-0.5 rounded-full bg-[#C9A24B]"
                />
              )}
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
              <span className="text-xs leading-none whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
