import { createItem, ensureInventory, imageBucket, listItems, seedIfEmpty, setItemStatus } from "../../../db/inventory";

export const runtime = "edge";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Ocurrió un problema inesperado.";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    await ensureInventory();
    await seedIfEmpty();
    return Response.json({ items: await listItems() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await ensureInventory();
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim();
    const size = String(form.get("size") || "").trim();
    const color = String(form.get("color") || "").trim();
    const cost = Math.round(Number(form.get("cost")));
    const price = Math.round(Number(form.get("price")));
    if (!name || !Number.isFinite(cost) || !Number.isFinite(price) || cost < 0 || price < 0) {
      return Response.json({ error: "Revisa el nombre, el costo y el precio de venta." }, { status: 400 });
    }

    const photo = form.get("photo");
    let imageKey: string | null = null;
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > 8 * 1024 * 1024) return Response.json({ error: "La foto debe pesar menos de 8 MB." }, { status: 400 });
      if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(photo.type)) return Response.json({ error: "Usa una foto JPG, PNG o WEBP." }, { status: 400 });
      imageKey = `prendas/${crypto.randomUUID()}`;
      await imageBucket().put(imageKey, photo.stream(), { httpMetadata: { contentType: photo.type } });
    }

    const item = await createItem({ name, code, size, color, cost, price, imageKey });
    return Response.json({ item }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await ensureInventory();
    const body = await request.json() as { id?: number; status?: "available" | "sold"; soldBy?: string | null };
    if (!Number.isInteger(body.id) || !body.id || !["available", "sold"].includes(body.status || "")) {
      return Response.json({ error: "La actualización no es válida." }, { status: 400 });
    }
    const item = await setItemStatus(body.id, body.status!, body.status === "sold" ? (body.soldBy?.trim() || "Una socia") : null);
    return Response.json({ item });
  } catch (error) { return errorResponse(error); }
}
