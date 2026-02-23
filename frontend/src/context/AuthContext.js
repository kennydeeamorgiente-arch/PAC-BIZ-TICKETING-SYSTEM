'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import api from '@/lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    const token = Cookies.get('auth_token');

    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const userData = await api.getCurrentUser();
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Auth check failed:', error);
      if (String(error?.message || '').toLowerCase().includes('unauthorized')) {
        Cookies.remove('auth_token');
        setUser(null);
      }
      throw error;
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        await refreshUser();
      } catch {
        // ignore refresh error during initial bootstrap
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.login(email, password);

      Cookies.set('auth_token', response.token, {
        expires: 7,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      setUser(response.user);
      router.push('/dashboard');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Login failed',
      };
    }
  };

  const logout = () => {
    Cookies.remove('auth_token');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
