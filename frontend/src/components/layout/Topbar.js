'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ProfileModal from '@/components/profile/ProfileModal';
import api from '@/lib/api';

export default function Topbar({ onMenuClick, onToggleCollapse, sidebarCollapsed = false }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const panelRef = useRef(null);
  const safeUser = user || { name: 'User' };

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.getNotifications(40);
      const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      setNotifications(rows);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    const timerId = setInterval(() => {
      void fetchNotifications();
    }, 30000);

    const initialId = setTimeout(() => {
      void fetchNotifications();
    }, 0);

    return () => {
      clearInterval(timerId);
      clearTimeout(initialId);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  const markAsRead = async (id) => {
    const now = new Date().toISOString();
    const next = notifications.map((item) => (item.id === id ? { ...item, read_at: item.read_at || now } : item));
    setNotifications(next);
    try {
      await api.markNotificationRead(id);
    } catch {
      // keep optimistic UI state even if API write fails
    }
  };

  const markAllAsRead = async () => {
    const now = new Date().toISOString();
    const next = notifications.map((item) => ({ ...item, read_at: item.read_at || now }));
    setNotifications(next);
    try {
      await api.markAllNotificationsRead();
    } catch {
      // keep optimistic UI state even if API write fails
    }
  };

  const onNotificationClick = async (item) => {
    await markAsRead(item.id);
    setPanelOpen(false);
    if (item.ticket_id) {
      router.push(`/tickets/${item.ticket_id}`);
    }
  };

  return (
    <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-4 lg:px-6 dark:border-primary-700 dark:bg-slate-900/95">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-primary-700/60 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <button
          onClick={onToggleCollapse}
          className="hidden rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-primary-700/60 lg:inline-flex"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex-1" />

      <div className="ml-2 flex items-center space-x-2 sm:ml-4 sm:space-x-4">
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-primary-700/40 dark:text-slate-100 dark:hover:bg-primary-700/60 md:hidden"
          aria-label="Open profile"
          title="My Profile"
        >
          {safeUser.avatar_data ? (
            <img
              src={safeUser.avatar_data}
              alt="Profile avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            safeUser.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </button>

        <div ref={panelRef} className="relative">
          <button
            onClick={() => setPanelOpen((prev) => !prev)}
            className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-primary-700/60"
            aria-label="Open notifications"
          >
            <Bell className="h-6 w-6" />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {panelOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-primary-700 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-primary-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Notifications</p>
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-secondary-700 hover:text-secondary-600"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">No notifications</p>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onNotificationClick(item)}
                      className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-primary-800 dark:hover:bg-primary-900/30 ${
                        item.read_at ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/50 dark:bg-primary-900/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
                        {!item.read_at ? <span className="h-2 w-2 rounded-full bg-secondary-500" /> : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">{item.message}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        onSaved={refreshUser}
      />
    </div>
  );
}
