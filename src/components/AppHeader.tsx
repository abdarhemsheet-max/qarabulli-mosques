import { useState } from 'react';
import { LogOut, WifiOff } from 'lucide-react';
import type { UserProfile } from '../types/mosque';

export function MosqueMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 2.5 13.6 5h-3.2L12 2.5Z" fill="currentColor" />
      <path d="M5 12a7 7 0 0 1 14 0v8.5H5V12Z" />
      <path d="M9.5 20.5V16a2.5 2.5 0 0 1 5 0v4.5" />
    </svg>
  );
}

interface AppHeaderProps {
  user: UserProfile;
  title: string;
  isOnline: boolean;
  onSignOut: () => void;
}

export function AppHeader({ user, title, isOnline, onSignOut }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = user.name.trim().charAt(0) || '؟';

  return (
    <header className="relative z-[700] shrink-0 bg-brand text-white pt-[env(safe-area-inset-top)]">
      <div className="h-14 px-3 sm:px-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/10 text-gold flex items-center justify-center shrink-0">
          <MosqueMark />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold leading-tight truncate">{title}</p>
          <p className="text-[11px] text-white/65 leading-tight truncate">أوقاف القره بوللي</p>
        </div>

        {!isOnline && (
          <span className="h-7 px-2.5 rounded-full bg-amber-400 text-ink text-xs font-bold flex items-center gap-1">
            <WifiOff className="w-3.5 h-3.5" />
            بدون إنترنت
          </span>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-9 h-9 rounded-full bg-gold text-brand font-black flex items-center justify-center shrink-0"
          aria-label="الحساب"
        >
          {initial}
        </button>
      </div>

      {menuOpen && (
        <>
          <button type="button" aria-label="إغلاق" className="fixed inset-0 z-0 cursor-default" onClick={() => setMenuOpen(false)} />
          <div className="awqaf-sheet absolute left-3 top-[calc(100%+6px)] z-10 w-64 card shadow-2xl text-ink p-2">
            <div className="px-3 py-2.5">
              <p className="font-extrabold truncate">{user.name}</p>
              <p className="text-xs text-muted truncate" dir="ltr">
                {user.email}
              </p>
              <span className="inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand">
                {user.role === 'admin' ? 'مدير المكتب' : 'موثِّق ميداني'}
              </span>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="w-full h-11 px-3 rounded-xl flex items-center gap-2 text-red-700 font-bold hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        </>
      )}
    </header>
  );
}
