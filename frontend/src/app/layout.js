import { Montserrat, Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import ThemeInit from '@/components/common/ThemeInit';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['500', '700', '800'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'IT Ticketing System - Pac Biz',
  description: 'Internal IT support ticketing system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} ${plusJakartaSans.variable} font-sans`}>
        <AuthProvider>
          <ThemeInit />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
