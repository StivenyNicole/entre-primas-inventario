import { env } from "cloudflare:workers";

export type InventoryItem = {
  id: number;
  name: string;
  code: string;
  size: string;
  color: string;
  cost: number;
  price: number;
  status: "available" | "sold";
  imageKey: string | null;
  soldBy: string | null;
  soldAt: string | null;
  createdAt: string;
};

type Row = {
  id: number; name: string; code: string; size: string; color: string;
  cost: number; price: number; status: "available" | "sold";
  image_key: string | null; sold_by: string | null; sold_at: string | null; created_at: string;
};

function database() {
  if (!env.DB) throw new Error("El inventario compartido todavía no está conectado.");
  return env.DB;
}

export async function ensureInventory() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      cost INTEGER NOT NULL DEFAULT 0,
      price INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      image_key TEXT,
      sold_by TEXT,
      sold_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS items_status_idx ON items (status)"),
  ]);
}

function map(row: Row): InventoryItem {
  return {
    id: row.id, name: row.name, code: row.code, size: row.size, color: row.color,
    cost: row.cost, price: row.price, status: row.status, imageKey: row.image_key,
    soldBy: row.sold_by, soldAt: row.sold_at, createdAt: row.created_at,
  };
}

export async function listItems() {
  const result = await database().prepare("SELECT * FROM items ORDER BY CASE status WHEN 'available' THEN 0 ELSE 1 END, id DESC").all<Row>();
  return result.results.map(map);
}

export async function seedIfEmpty() {
  const count = await database().prepare("SELECT COUNT(*) AS total FROM items").first<{ total: number }>();
  if ((count?.total ?? 0) > 0) return;
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO items (name, code, size, color, cost, price) VALUES (?, ?, ?, ?, ?, ?)").bind("Vestido floral", "VES-024", "M", "Azul", 65000, 120000),
    db.prepare("INSERT INTO items (name, code, size, color, cost, price) VALUES (?, ?, ?, ?, ?, ?)").bind("Blusa manga corta", "BLU-018", "S", "Blanco", 32000, 65000),
    db.prepare("INSERT INTO items (name, code, size, color, cost, price) VALUES (?, ?, ?, ?, ?, ?)").bind("Jean tiro alto", "JEA-011", "10", "Índigo", 58000, 105000),
  ]);
}

export async function createItem(values: Omit<InventoryItem, "id" | "status" | "soldBy" | "soldAt" | "createdAt">) {
  const row = await database().prepare(`INSERT INTO items (name, code, size, color, cost, price, image_key)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(values.name, values.code, values.size, values.color, values.cost, values.price, values.imageKey).first<Row>();
  if (!row) throw new Error("No se pudo guardar la prenda.");
  return map(row);
}

export async function setItemStatus(id: number, status: "available" | "sold", soldBy: string | null) {
  const row = status === "sold"
    ? await database().prepare("UPDATE items SET status = 'sold', sold_by = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *").bind(soldBy, id).first<Row>()
    : await database().prepare("UPDATE items SET status = 'available', sold_by = NULL, sold_at = NULL WHERE id = ? RETURNING *").bind(id).first<Row>();
  if (!row) throw new Error("No encontramos esa prenda.");
  return map(row);
}

export function imageBucket() {
  if (!env.IMAGES_BUCKET) throw new Error("El almacenamiento de fotos todavía no está conectado.");
  return env.IMAGES_BUCKET;
}
