const PB_URL = (process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://base.pocketstiven.com").replace(/\/$/, "");

export async function GET(request: Request) {
  const requestedUrl = new URL(request.url).searchParams.get("url");
  if (!requestedUrl) return new Response("Falta la foto", { status: 400 });

  let target: URL;
  try {
    target = new URL(requestedUrl);
  } catch {
    return new Response("Dirección de foto inválida", { status: 400 });
  }

  const pocketBase = new URL(PB_URL);
  if (target.origin !== pocketBase.origin || !target.pathname.startsWith("/api/files/")) {
    return new Response("Foto no permitida", { status: 403 });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok) return new Response("No se pudo cargar la foto", { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "cache-control": "public, max-age=3600",
    },
  });
}
