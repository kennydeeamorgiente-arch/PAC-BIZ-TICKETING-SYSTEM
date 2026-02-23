'use client';

import { useEffect } from 'react';

const PREF_KEY = 'pacbiz_settings';

export default function ThemeInit() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const darkMode = Boolean(parsed?.darkMode);
      document.documentElement.classList.toggle('dark', darkMode);
    } catch {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return null;
}

