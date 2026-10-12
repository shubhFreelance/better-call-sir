import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
export const metadata: Metadata = {
  title: "Better Call Sir · Find your kind of teacher",
  description:
    "Find a teacher who understands your child. Maths and Science tuition for Classes 6–10 in Raipur.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
