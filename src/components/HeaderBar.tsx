import { LogOut, Users, Wifi, WifiOff } from 'lucide-react';
import type { ActiveTab, UserProfile } from '../types/mosque';

interface HeaderBarProps {
  user: UserProfile;
  isOnline: boolean;
  pendingCount: number;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onSignOut: () => void;
}

export function HeaderBar({
  user,
  isOnline,
  pendingCount,
  activeTab,
  onSelectTab,
  onSignOut,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 h-12 bg-white/95 backdrop-blur-md border-b border-[#E5E2D9] px-3 sm:px-6 flex items-center justify-between gap-3">
      {/* Brand Title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm sm:text-base font-bold text-[#0F4C3A] truncate">
          توثيق مساجد أوقاف القره بوللي
        </span>
      </div>

      {/* Live Connectivity + Manager Users + Sign Out */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg ${
            isOnline
              ? 'text-[#0F4C3A] bg-[#0F4C3A]/8'
              : 'text-amber-800 bg-amber-100'
          }`}
          title={isOnline ? 'متصل بالخادم' : 'وضع عدم الاتصال — يتم الحفظ محلياً'}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="whitespace-nowrap">
            {isOnline ? 'متصل' : 'غير متصل'}
          </span>
          {pendingCount > 0 && (
            <span className="tabular-nums text-[11px] opacity-85">
              ({pendingCount})
            </span>
          )}
        </div>

        <span className="hidden md:inline text-xs text-[#5A6561] whitespace-nowrap">
          {user.name} · {user.role === 'admin' ? 'مدير' : 'موثِّق'}
        </span>

        {user.role === 'admin' && (
          <button
            type="button"
            onClick={() => onSelectTab(activeTab === 'users' ? 'list' : 'users')}
            className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-[#0F4C3A] text-white'
                : 'text-[#0F4C3A] hover:bg-[#0F4C3A]/10'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمون</span>
          </button>
        )}

        <button
          type="button"
          onClick={onSignOut}
          aria-label="تسجيل الخروج"
          title="تسجيل الخروج"
          className="min-h-[36px] min-w-[36px] px-2 rounded-lg text-xs font-medium text-[#5A6561] hover:text-red-700 hover:bg-red-50 flex items-center justify-center gap-1 transition"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>
    </header>
  );
}
