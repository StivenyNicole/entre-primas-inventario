import { imageBucket } from "../../../db/inventory";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key");
    if (!key || !key.startsWith("prendas/")) return new Response("Foto no válida", { status: 400 });
    const object = await imageBucket().get(key);
    if (!object) return new Response("Foto no encontrada", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=86400");
    return new Response(object.body, { headers });
  } catch { return new Response("No se pudo cargar la foto", { status: 500 }); }
}
