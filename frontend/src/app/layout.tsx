import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ClientLayout } from "@/components/layout/ClientLayout";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "PulseNet — System Monitoring Platform",
  description:
    "Open-source infrastructure monitoring dashboard. Track CPU, RAM, Disk and Uptime in real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans bg-surface-DEFAULT text-white antialiased`}
      >
        <AuthProvider>
          <NotificationProvider>
            <ClientLayout>{children}</ClientLayout>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

