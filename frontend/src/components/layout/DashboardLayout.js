'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const SIDEBAR_COLLAPSE_KEY = 'pacbiz_sidebar_collapsed';

function readCollapsedPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsedPreference);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, sidebarCollapsed ? '1' : '0');
      window.dispatchEvent(
        new CustomEvent('pacbiz_sidebar_change', {
          detail: { collapsed: sidebarCollapsed },
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== SIDEBAR_COLLAPSE_KEY) return;
      setSidebarCollapsed(event.newValue === '1');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleDesktopSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">
      <div className="fixed inset-y-0 left-0 hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={() => setSidebarOpen(false)}
          ></div>
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <Sidebar collapsed={false} />
          </div>
        </div>
      )}

      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <Topbar
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onToggleCollapse={toggleDesktopSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6 lg:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
