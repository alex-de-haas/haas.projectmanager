import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Time Tracker',
  description: 'Track time spent on tasks and bugs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
