import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Entre Primas | Inventario compartido",
  description: "Inventario de Entre Primas para saber qué prendas están disponibles o vendidas.",
  icons: { icon: "/entre-primas-logo.png", apple: "/entre-primas-logo.png" },
  openGraph: { title: "Entre Primas", description: "Inventario compartido, ventas sin confusiones" },
  twitter: { card: "summary", title: "Entre Primas", description: "Inventario compartido, ventas sin confusiones" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
