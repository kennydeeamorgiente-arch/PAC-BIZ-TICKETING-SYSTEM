'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="fixed inset-y-0 left-0 hidden lg:block">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={() => setSidebarOpen(false)}
          ></div>
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
