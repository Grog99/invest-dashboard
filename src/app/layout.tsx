import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider, type Theme } from "@/components/ThemeProvider";
import { getTheme } from "@/lib/settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Invest Dashboard",
  description: "Prywatny dashboard inwestycyjny",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Motyw: ciasteczko (request-time, opt-in do dynamic rendering) → fallback
  // DB (`settings`, trwałe źródło prawdy) → fallback "dark". Odczyt ciasteczka
  // w root layoucie eliminuje FOUC — <html data-theme> jest poprawny już w
  // pierwszym HTML.
  const cookieTheme = (await cookies()).get("theme")?.value;
  const theme: Theme =
    cookieTheme === "light" || cookieTheme === "dark"
      ? cookieTheme
      : getTheme();

  return (
    <html
      lang="pl"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider initial={theme}>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
