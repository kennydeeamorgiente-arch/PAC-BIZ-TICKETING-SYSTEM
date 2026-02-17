'use client';

import { useState } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Topbar({ onMenuClick }) {
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const safeUser = user || {
    name: 'Demo User',
    role: 'admin',
  };

  const handleSearch = (e) => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
  };

  return (
    <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      <form onSubmit={handleSearch} className="max-w-lg flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-secondary-500"
          />
        </div>
      </form>

      <div className="ml-4 flex items-center space-x-4">
        <button className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100">
          <Bell className="h-6 w-6" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger"></span>
        </button>

        <div className="hidden items-center space-x-2 rounded-full bg-gray-100 px-3 py-1 md:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-500 text-sm font-bold text-white">
            {safeUser.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="text-sm">
            <div className="font-medium">{safeUser.name}</div>
            <div className="text-xs capitalize text-gray-500">{safeUser.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
