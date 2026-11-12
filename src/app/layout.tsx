import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devis Vocal IA — Commercial",
  description: "Création de devis à la voix avec Agent Mistral, Supabase et export PDF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
