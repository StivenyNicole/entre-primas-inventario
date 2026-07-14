import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "Mi Tienda | Inventario compartido",
    description: "Inventario sencillo para saber qué prendas están disponibles o vendidas.",
    openGraph: { title: "Mi Tienda", description: "Inventario compartido, ventas sin confusiones", images: [{ url: imageUrl, width: 1733, height: 908 }] },
    twitter: { card: "summary_large_image", title: "Mi Tienda", description: "Inventario compartido, ventas sin confusiones", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
