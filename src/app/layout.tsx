import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digitalno groblje | Uspomene koje traju",
  description:
    "Dostojanstveno mesto za čuvanje uspomena, fotografija i priča o voljenima.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sr-Latn">
      <body>{children}</body>
    </html>
  );
}
