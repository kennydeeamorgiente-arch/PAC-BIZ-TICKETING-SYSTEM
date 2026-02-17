'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Ticket,
  BarChart3,
  Users,
  Settings,
  Clock,
  LogOut,
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const safeUser = user || {
    name: 'Demo User',
    role: 'admin',
    shift_type: 'AM',
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'technician', 'manager'],
    },
    {
      name: 'Tickets',
      href: '/tickets',
      icon: Ticket,
      roles: ['admin', 'technician', 'manager'],
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: BarChart3,
      roles: ['admin', 'manager'],
    },
    {
      name: 'Admin',
      href: '/admin/users',
      icon: Users,
      roles: ['admin'],
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      roles: ['admin', 'technician', 'manager'],
    },
  ];

  const allowedNav = navigation.filter((item) => item.roles.includes(safeUser.role));

  return (
    <div className="flex h-full w-64 flex-col bg-primary-500 text-white">
      <div className="border-b border-primary-600 p-6">
        <h1 className="text-xl font-bold">IT Ticketing</h1>
        <p className="mt-1 text-xs text-gray-300">Pac Biz</p>
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
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? 'border-l-4 border-accent-500 bg-primary-700 text-white'
                  : 'text-gray-300 hover:bg-primary-600 hover:text-white'
              }`}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-primary-600 bg-primary-600 p-4">
        <div className="mb-2 flex items-center text-xs text-gray-300">
          <Clock className="mr-2 h-4 w-4" />
          Current Shift
        </div>
        <div className="text-sm font-semibold">{safeUser.shift_type} SHIFT</div>
        <div className="mt-1 text-xs text-gray-400">
          {safeUser.shift_type === 'AM' && '6:00 AM - 2:00 PM'}
          {safeUser.shift_type === 'PM' && '2:00 PM - 10:00 PM'}
          {safeUser.shift_type === 'GY' && '10:00 PM - 6:00 AM'}
        </div>
      </div>

      <div className="border-t border-primary-600 p-4">
        <div className="mb-3 flex items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500 font-bold text-white">
            {safeUser.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium">{safeUser.name}</p>
            <p className="text-xs capitalize text-gray-400">{safeUser.role}</p>
          </div>
        </div>
        <button
          onClick={() => logout?.()}
          className="flex w-full items-center rounded px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-primary-600"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
