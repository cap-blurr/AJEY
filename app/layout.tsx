import "@/styles/globals.css"
import { Metadata } from "next"

import { siteConfig } from "@/config/site"
import { fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"
import RetroGrid from "@/components/magicui/retro-grid"
import { SiteHeader } from "@/components/site-header"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"
import { PrivyProviderWrapper } from "@/components/privy-provider"

// Animated list removed from landing; will be reused elsewhere
// Landing-only sections moved out of layout to the index page
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <>
      <html lang="en" suppressHydrationWarning>
        <head />
        <body
          className={cn(
            "max-h-auto bg-background font-sans antialiased",
            fontSans.variable
          )}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <PrivyProviderWrapper>
              <div className="relative flex min-h-screen flex-col">
                <SiteHeader />
                <div className="flex-1 justify-center items-center w-full">
                  {children}
                </div>
              </div>
              <SiteFooter className=" fixed border-t bottom-0 inset-x-0 sm:static" />
              
              {/* <div className="fixed bottom-0 inset-x-0 sm:static bg-neutral-900/3"> */}
               
              {/* </div> */}
              <TailwindIndicator />
              
            </PrivyProviderWrapper>
          </ThemeProvider>
        </body>
      </html>
    </>
  )
}

