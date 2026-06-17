import type { Metadata } from "next";
import "./globals.css";
import { AttendantProvider } from "@/lib/attendantContext";

export const metadata: Metadata = {
  title: "Casa da Criança Batuira",
  description: "Painel de atendimento — Casa da Criança Batuira",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <AttendantProvider>{children}</AttendantProvider>
      </body>
    </html>
  );
}
