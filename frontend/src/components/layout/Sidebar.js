'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ProfileModal from '@/components/profile/ProfileModal';
import {
  LayoutDashboard,
  Ticket,
  BarChart3,
  BrainCircuit,
  Users,
  Settings,
  Clock,
  LogOut,
} from 'lucide-react';

export default function Sidebar({ collapsed = false }) {
  const pathname = usePathname();
  const { user, logout, refreshUser } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const safeUser = user || {
    name: 'Demo User',
    role: 'technician',
    shift_type: 'AM',
    avatar_data: null,
  };
  const normalizedRole =
    safeUser.role === 'agent' || safeUser.role === 'user' ? 'technician' : safeUser.role;

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['technician', 'admin'],
    },
    {
      name: 'Tickets',
      href: '/tickets',
      icon: Ticket,
      roles: ['technician', 'admin'],
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: BarChart3,
      roles: ['technician', 'admin'],
    },
    {
      name: 'AI Review',
      href: '/ai-review',
      icon: BrainCircuit,
      roles: ['technician', 'admin'],
    },
    {
      name: 'User Management',
      href: '/admin/users',
      icon: Users,
      roles: ['technician', 'admin'],
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      roles: ['technician', 'admin'],
    },
  ];

  const allowedNav = navigation.filter((item) => item.roles.includes(normalizedRole));

  return (
    <div className={`flex h-full flex-col bg-primary-500 text-white transition-all duration-300 dark:bg-primary-700 ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className={`border-b border-primary-600 dark:border-primary-600 ${collapsed ? 'p-3' : 'p-6'}`}>
        <div className="flex items-center">
          {collapsed ? (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary-700 text-sm font-bold dark:bg-primary-600">
              IT
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold">IT Ticketing</h1>
              <p className="mt-1 text-xs text-gray-300 dark:text-blue-100/80">Pac Biz</p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {allowedNav.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : ''}
              className={`flex items-center py-3 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? `border-l-4 border-accent-500 bg-primary-700 text-white dark:bg-primary-600 dark:text-white ${collapsed ? 'justify-center px-0' : 'px-6'}`
                  : 'text-gray-300 hover:bg-primary-600 hover:text-white dark:text-blue-100/80 dark:hover:bg-primary-600 dark:hover:text-white'
              } ${!isActive && (collapsed ? 'justify-center px-0' : 'px-6')
              }`}
            >
              <Icon className={`h-5 w-5 ${collapsed ? '' : 'mr-3'}`} />
              {!collapsed ? item.name : null}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-primary-600 bg-primary-600 dark:border-primary-600 dark:bg-primary-600 ${collapsed ? 'p-3' : 'p-4'}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <Clock className="h-5 w-5 text-blue-100/90" />
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center text-xs text-gray-300 dark:text-blue-100/80">
              <Clock className="mr-2 h-4 w-4" />
              Current Shift
            </div>
            <div className="text-sm font-semibold">{safeUser.shift_type} SHIFT</div>
            <div className="mt-1 text-xs text-gray-400 dark:text-blue-100/70">
              {safeUser.shift_type === 'AM' && '6:00 AM - 2:00 PM'}
              {safeUser.shift_type === 'PM' && '2:00 PM - 10:00 PM'}
              {safeUser.shift_type === 'GY' && '10:00 PM - 6:00 AM'}
            </div>
          </>
        )}
      </div>

      <div className={`border-t border-primary-600 dark:border-primary-600 ${collapsed ? 'p-3' : 'p-4'}`}>
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          title={collapsed ? 'My Profile' : ''}
          className={`mb-3 flex w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-primary-600 dark:hover:bg-primary-600 ${
            collapsed ? 'justify-center' : 'items-center'
          }`}
        >
          {safeUser.avatar_data ? (
            <img
              src={safeUser.avatar_data}
              alt="Profile avatar"
              className="h-10 w-10 rounded-full border border-white/20 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500 font-bold text-white">
              {safeUser.name?.charAt(0)?.toUpperCase()}
            </div>
          )}
          {!collapsed ? (
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium">{safeUser.name}</p>
              <p className="text-xs capitalize text-gray-400">{normalizedRole}</p>
            </div>
          ) : null}
        </button>
        <button
          onClick={() => logout?.()}
          title={collapsed ? 'Logout' : ''}
          className={`flex w-full items-center rounded px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-primary-600 dark:text-blue-100/80 dark:hover:bg-primary-600 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className={`h-4 w-4 ${collapsed ? '' : 'mr-2'}`} />
          {!collapsed ? 'Logout' : null}
        </button>
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
