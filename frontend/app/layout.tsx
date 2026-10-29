import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Geist_Mono, Manrope } from "next/font/google";

import { MotionProvider } from "@/components/motion-provider";

import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoreEx",
  description: "Your personal knowledge base",
};

// Runs before first paint so a picked theme never flashes. cookies() would need a Suspense boundary around <html>.
const applyTheme = `(function(){var m=document.cookie.match(/(?:^|; )theme=(light|dark)(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1]})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${atkinson.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyTheme }} />
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
