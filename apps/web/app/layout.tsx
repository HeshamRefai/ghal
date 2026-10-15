import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'G-HAL — Adaptive Process Redesign' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'system-ui', margin: 0, background: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
