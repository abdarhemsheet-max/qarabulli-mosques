import { LayoutDashboard, List, Map as MapIcon } from 'lucide-react';
import type { ActiveTab } from '../types/mosque';

interface BottomNavProps {
  activeTab: ActiveTab;
  isAdmin: boolean;
  onSelectTab: (tab: ActiveTab) => void;
}

export function BottomNav({ activeTab, isAdmin, onSelectTab }: BottomNavProps) {
  const items: { id: ActiveTab; label: string; icon: typeof MapIcon }[] = [
    { id: 'map', label: 'الخريطة', icon: MapIcon },
    { id: 'list', label: 'المساجد', icon: List },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'الإدارة', icon: LayoutDashboard }] : []),
  ];

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="relative z-[700] shrink-0 bg-white border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <div className="h-16 max-w-md mx-auto flex">
        {items.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`h-8 w-14 rounded-full flex items-center justify-center transition ${
                  active ? 'bg-brand-soft text-brand' : 'text-muted'
                }`}
              >
                <Icon className={`w-5.5 h-5.5 ${active ? 'stroke-[2.4]' : ''}`} />
              </span>
              <span className={`text-xs ${active ? 'font-extrabold text-brand' : 'font-semibold text-muted'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
