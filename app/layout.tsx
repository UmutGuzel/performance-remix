import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Performance Remix",
  description: "Swap the person in a clip for any character, keeping the motion, camera and sound. Runs in ComfyUI on open-weights models.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
