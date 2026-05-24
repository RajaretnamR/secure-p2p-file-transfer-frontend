import { Toaster } from "react-hot-toast";
import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "P2P File Transfer",
  description: "Transfer files directly between browsers",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col`}>

  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>

    <main className="flex-1">
      {children}
    </main>

    <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#111827",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.1)",
          },
        }}
      />

    <footer className="container py-6 text-center text-sm text-muted-foreground space-y-1">
      <p>Files are transferred through our secure Axum server.</p>

      <p className="text-sm">
        Developed by{" "}
        <a
          href="https://github.com/RajaretnamR"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          Raja Retnam
        </a>
      </p>
    </footer>

  </ThemeProvider>

</body>
    </html>
  )
}

