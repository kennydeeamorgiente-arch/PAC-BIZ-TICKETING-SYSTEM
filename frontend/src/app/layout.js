import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import ThemeInit from '@/components/common/ThemeInit';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'IT Ticketing System - Pac Biz',
  description: 'Internal IT support ticketing system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ThemeInit />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
