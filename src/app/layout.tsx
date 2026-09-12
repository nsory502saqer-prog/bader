import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import '@primer/primitives/dist/css/primitives.css';
import './globals.css';

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  // وزنان فقط في كامل النظام: عادي وشبه عريض.
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-plex-arabic',
});

export const metadata: Metadata = {
  title: {
    default: 'نظام إدارة طلبات الإعانات',
    template: '%s · نظام إدارة طلبات الإعانات',
  },
  description: 'نظام إدارة طلبات الإعانات الطبية — جمعية بادر للأجهزة الطبية',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * يُحقن قبل الرسم الأول فيمنع وميض الوضع الفاتح على من اختار الليلي.
 * يضبط سمات Primer الثلاث التي تتوقعها ملفات الرموز.
 */
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('bader-color-mode');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
    var el = document.documentElement;
    el.setAttribute('data-color-mode', mode);
    el.setAttribute('data-light-theme', 'light');
    el.setAttribute('data-dark-theme', 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-color-mode="light"
      data-light-theme="light"
      data-dark-theme="dark"
      className={plex.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
