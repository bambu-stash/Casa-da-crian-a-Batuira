import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batuira Bot",
  description: "Painel de atendimento — Casa da Criança Batuira",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
