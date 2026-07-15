export type InventoryItem = {
  id: string;
  name: string;
  code: string;
  size: string;
  color: string;
  audience: ProductAudience;
  category: ProductCategory | "";
  cost: number;
  price: number;
  status: "available" | "sold";
  imageUrl: string | null;
  originalImageUrl: string | null;
  soldAt: string | null;
  createdAt: string;
};

type PocketBaseRecord = {
  id: string;
  collectionId: string;
  name?: string;
  code?: string;
  size?: string;
  color?: string;
  audience?: ProductAudience;
  category?: ProductCategory;
  cost?: number;
  price?: number;
  status?: "available" | "sold";
  photo?: string;
  sold_at?: string;
  created?: string;
};

const PB_URL = (process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://base.pocketstiven.com").replace(/\/$/, "");
const COLLECTION = "clothing_inventory";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

async function parseResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let body: Record<string, unknown> | null = null;
  try { body = raw ? JSON.parse(raw) as Record<string, unknown> : null; } catch { /* PocketBase or the proxy may return plain text. */ }

  if (!response.ok) {
    if (response.status === 413 || /payload too large/i.test(raw)) {
      throw new Error("La foto es demasiado pesada. Elige otra imagen o toma la foto con menor resolución.");
    }
    if (response.status === 404) {
      throw new Error("La colección de inventario aún no está creada en PocketBase.");
    }
    if (/something went wrong while processing your request/i.test(raw)) {
      throw new Error("No pudimos cargar el inventario. Pulsa Actualizar para intentarlo nuevamente.");
    }
    const details = body?.data && typeof body.data === "object"
      ? Object.values(body.data as Record<string, { message?: string }>).map((item) => item?.message).filter(Boolean).join(" ")
      : "";
    throw new Error(details || String(body?.message || "PocketBase no pudo completar la operación."));
  }

  return (body ?? {}) as T;
}

function mapRecord(record: PocketBaseRecord): InventoryItem {
  const originalImageUrl = record.photo
    ? `${PB_URL}/api/files/${encodeURIComponent(record.collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(record.photo)}`
    : null;
  const imageUrl = originalImageUrl ? `${originalImageUrl}?thumb=900x675` : null;
  return {
    id: record.id,
    name: record.name || "Sin nombre",
    code: record.code || "",
    size: record.size || "",
    color: record.color || "",
    audience: record.audience === "hombre" ? "hombre" : "mujer",
    category: record.category || "",
    cost: Number(record.cost || 0),
    price: Number(record.price || 0),
    status: record.status === "sold" ? "sold" : "available",
    imageUrl,
    originalImageUrl,
    soldAt: record.sold_at || null,
    createdAt: record.created || "",
  };
}

export async function listInventory(): Promise<InventoryItem[]> {
  const query = new URLSearchParams({ page: "1", perPage: "200" });
  const response = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records?${query}`, { cache: "no-store" });
  const data = await parseResponse<{ items: PocketBaseRecord[] }>(response);
  return (data.items || []).map(mapRecord).sort((a, b) => a.status === b.status ? 0 : a.status === "available" ? -1 : 1);
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pudimos leer la foto seleccionada.")); };
    image.src = url;
  });
}

async function preparePhoto(file: File): Promise<File> {
  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No pudimos preparar la foto.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ("close" in image && typeof image.close === "function") image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("No pudimos reducir el tamaño de la foto.");
  if (blob.size > MAX_PHOTO_BYTES) throw new Error("La foto sigue siendo demasiado pesada. Elige una imagen diferente.");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "prenda";
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

export async function createInventoryItem(form: FormData): Promise<InventoryItem> {
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) form.set("photo", await preparePhoto(photo));
  else form.delete("photo");
  form.set("status", "available");
  const response = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records`, { method: "POST", body: form });
  return mapRecord(await parseResponse<PocketBaseRecord>(response));
}

export async function updateInventoryItem(id: string, form: FormData): Promise<InventoryItem> {
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) form.set("photo", await preparePhoto(photo));
  else form.delete("photo");
  const response = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: form,
  });
  return mapRecord(await parseResponse<PocketBaseRecord>(response));
}

export async function updateInventoryStatus(id: string, status: "available" | "sold"): Promise<InventoryItem> {
  const response = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, sold_at: status === "sold" ? new Date().toISOString() : "" }),
  });
  return mapRecord(await parseResponse<PocketBaseRecord>(response));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const response = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (response.status === 403) {
    throw new Error("PocketBase todavía no permite eliminar prendas. Activa la regla de eliminación de la colección.");
  }
  await parseResponse<Record<string, never>>(response);
}

function safeFileName(item: InventoryItem) {
  return (item.code || item.name || "prenda").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "prenda";
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function itemAsJpeg(item: InventoryItem): Promise<File> {
  if (!item.originalImageUrl) throw new Error(`${item.name} no tiene foto.`);
  const response = await fetch(`/api/photo?url=${encodeURIComponent(item.originalImageUrl)}`);
  if (!response.ok) throw new Error(`No pudimos preparar la foto de ${item.name}.`);
  const sourceBlob = await response.blob();
  const source = new File([sourceBlob], `${safeFileName(item)}-origen`, { type: sourceBlob.type || "image/jpeg" });
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No pudimos convertir las fotos a JPG.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  if ("close" in image && typeof image.close === "function") image.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!jpeg) throw new Error("No pudimos convertir una de las fotos a JPG.");
  return new File([jpeg], `${safeFileName(item)}-${item.id.slice(0, 6)}.jpg`, { type: "image/jpeg" });
}

export type ShareContent = {
  title: string;
  text: string;
  files: File[];
};

export type ProductAudience = "mujer" | "hombre";
export type ProductCategory = "blusas" | "busos" | "pantalones" | "maquillaje" | "bolsos" | "camisas" | "pantalonetas" | "otros";
export type PromotionCategory = `${ProductAudience}-${ProductCategory}`;

export const PRODUCT_CATEGORIES: Record<ProductAudience, Array<{ key: ProductCategory; label: string }>> = {
  mujer: [
    { key: "blusas", label: "Blusas" }, { key: "busos", label: "Busos" }, { key: "pantalones", label: "Pantalones" },
    { key: "maquillaje", label: "Maquillaje" }, { key: "bolsos", label: "Bolsos" }, { key: "otros", label: "Otros" },
  ],
  hombre: [
    { key: "busos", label: "Busos" }, { key: "camisas", label: "Camisas" }, { key: "pantalonetas", label: "Pantalonetas" }, { key: "otros", label: "Otros" },
  ],
};

const CATEGORY_ICONS: Record<ProductCategory, string> = { blusas: "👚", busos: "🧥", pantalones: "👖", maquillaje: "💄", bolsos: "👜", camisas: "👔", pantalonetas: "🩳", otros: "✨" };

export const PROMOTION_CATEGORIES: Array<{ key: PromotionCategory; audience: ProductAudience; category: ProductCategory; label: string; icon: string }> = (["mujer", "hombre"] as ProductAudience[]).flatMap((audience) =>
  PRODUCT_CATEGORIES[audience].map((category) => ({ key: `${audience}-${category.key}` as PromotionCategory, audience, category: category.key, label: category.label, icon: CATEGORY_ICONS[category.key] })),
);

function inferredCategory(item: Pick<InventoryItem, "name">): ProductCategory {
  const name = item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(blusa|camisa|camiseta|top|crop|body|bodysuit)\b/.test(name)) return "blusas";
  if (/\b(buso|busos|buzo|buzos|hoodie|sudadera)\b/.test(name)) return "busos";
  if (/\b(pantalon|pantalones|jean|jeans|legging|leggings|jogger|joggers|short|shorts)\b/.test(name)) return "pantalones";
  if (/\b(maquillaje|labial|base|sombra|pestana|pestanas|rimel|mascara|delineador|polvo|rubor|gloss|corrector)\b/.test(name)) return "maquillaje";
  if (/\b(bolso|bolsos|cartera|carteras|morral|morral|mochila|mochilas)\b/.test(name)) return "bolsos";
  return "otros";
}

export function productClassificationFor(item: Pick<InventoryItem, "name" | "audience" | "category">): { audience: ProductAudience; category: ProductCategory } {
  const audience = item.audience === "hombre" ? "hombre" : "mujer";
  let category = item.category || inferredCategory(item);
  if (!PRODUCT_CATEGORIES[audience].some((entry) => entry.key === category)) category = "otros";
  return { audience, category };
}

export function promotionCategoryFor(item: Pick<InventoryItem, "name" | "audience" | "category">): PromotionCategory {
  const classification = productClassificationFor(item);
  return `${classification.audience}-${classification.category}`;
}

export function productCategoryLabel(item: Pick<InventoryItem, "name" | "audience" | "category">): string {
  const classification = productClassificationFor(item);
  return PRODUCT_CATEGORIES[classification.audience].find((entry) => entry.key === classification.category)?.label || "Otros";
}

function balancedGroups<T>(items: T[]): T[][] {
  const groupCount = Math.ceil(items.length / 4);
  const baseSize = Math.floor(items.length / groupCount);
  let largerGroups = items.length % groupCount;
  let offset = 0;
  return Array.from({ length: groupCount }, () => {
    const size = baseSize + (largerGroups-- > 0 ? 1 : 0);
    const group = items.slice(offset, offset + size);
    offset += size;
    return group;
  });
}

function drawImageCover(context: CanvasRenderingContext2D, image: ImageBitmap | HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function collageSlots(count: number): Array<[number, number, number, number]> {
  const gap = 12;
  const full = 1080;
  const half = (full - gap) / 2;
  if (count === 1) return [[0, 0, full, full]];
  if (count === 2) return [[0, 0, half, full], [half + gap, 0, half, full]];
  if (count === 3) return [[0, 0, half, full], [half + gap, 0, half, half], [half + gap, half + gap, half, half]];
  return [[0, 0, half, half], [half + gap, 0, half, half], [0, half + gap, half, half], [half + gap, half + gap, half, half]];
}

async function createCollage(items: InventoryItem[], categoryLabel: string, index: number): Promise<File> {
  const files = await Promise.all(items.map(itemAsJpeg));
  const images = await Promise.all(files.map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No pudimos crear el collage.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  collageSlots(images.length).forEach(([x, y, width, height], imageIndex) => drawImageCover(context, images[imageIndex], x, y, width, height));
  context.fillStyle = "rgba(189, 63, 119, .92)";
  context.fillRect(0, 974, 1080, 106);
  context.fillStyle = "#ffffff";
  context.font = "800 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${categoryLabel} disponibles`, 540, 1027);

  const logoResponse = await fetch("/entre-primas-logo.png");
  if (!logoResponse.ok) throw new Error("No pudimos agregar el logo al collage.");
  const logoBlob = await logoResponse.blob();
  const logo = await loadImage(new File([logoBlob], "entre-primas-logo.png", { type: logoBlob.type || "image/png" }));
  context.beginPath();
  context.arc(540, 525, 145, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, .94)";
  context.fill();
  context.drawImage(logo, 410, 395, 260, 260);

  [...images, logo].forEach((image) => { if ("close" in image && typeof image.close === "function") image.close(); });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
  if (!blob) throw new Error("No pudimos guardar el collage.");
  return new File([blob], `entre-primas-${categoryLabel.toLowerCase()}-${index + 1}.jpg`, { type: "image/jpeg" });
}

export async function preparePromotionCollages(items: InventoryItem[], category: PromotionCategory): Promise<File[]> {
  const categoryInfo = PROMOTION_CATEGORIES.find((entry) => entry.key === category);
  const available = items.filter((item) => item.status === "available" && item.originalImageUrl && promotionCategoryFor(item) === category);
  if (!available.length || !categoryInfo) throw new Error("No hay productos con foto disponibles en esta categoría.");
  const groups = balancedGroups(available);
  const label = `${categoryInfo.label} ${categoryInfo.audience === "hombre" ? "para hombre" : "para mujer"}`;
  return Promise.all(groups.map((group, index) => createCollage(group, label, index)));
}

export async function prepareAvailablePhotos(items: InventoryItem[]): Promise<File[]> {
  const available = items.filter((item) => item.status === "available" && item.originalImageUrl);
  if (!available.length) throw new Error("No hay prendas disponibles con foto para descargar.");
  const files: File[] = [];
  for (const item of available) {
    files.push(await itemAsJpeg(item));
  }
  return files;
}

export function downloadPreparedFiles(files: File[]): void {
  files.forEach((file) => triggerDownload(file, file.name));
}

export async function sharePreparedContent(content: ShareContent): Promise<boolean> {
  if (!navigator.share || !navigator.canShare?.({ files: content.files })) return false;
  await navigator.share(content);
  return true;
}

export async function prepareInventorySale(item: InventoryItem): Promise<ShareContent> {
  const text = [
    "✅ PRENDA VENDIDA · ENTRE PRIMAS",
    "",
    `Prenda: ${item.name}`,
    item.code ? `Código: ${item.code}` : "",
    item.size ? `Talla: ${item.size}` : "",
    item.color ? `Color: ${item.color}` : "",
    `Precio: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(item.price)}`,
  ].filter(Boolean).join("\n");
  const file = item.originalImageUrl ? await itemAsJpeg(item) : null;
  return { title: "Prenda vendida · Entre Primas", text, files: file ? [file] : [] };
}
