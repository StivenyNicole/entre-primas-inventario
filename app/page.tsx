"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Item = {
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

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"available" | "sold" | "all">("available");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [seller, setSeller] = useState("Socia 1");

  async function loadItems(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/items", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos cargar el inventario");
      setItems(data.items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("inventario-nombre");
    if (saved) setSeller(saved);
    loadItems();
    const timer = window.setInterval(() => loadItems(true), 8000);
    return () => window.clearInterval(timer);
  }, []);

  function changeSeller(value: string) {
    setSeller(value);
    window.localStorage.setItem("inventario-nombre", value);
  }

  const counts = useMemo(() => ({
    available: items.filter((item) => item.status === "available").length,
    sold: items.filter((item) => item.status === "sold").length,
  }), [items]);

  const visible = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === "all" || item.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${item.name} ${item.code} ${item.size} ${item.color}`.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  }), [items, filter, search]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/items", { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la prenda");
      setItems((current) => [data.item, ...current]);
      setShowAdd(false);
      form.reset();
      flash("Prenda agregada al inventario");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Item, status: "available" | "sold") {
    setSaving(true);
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status, soldBy: status === "sold" ? seller : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la prenda");
      setItems((current) => current.map((row) => row.id === item.id ? data.item : row));
      setConfirmItem(null);
      flash(status === "sold" ? `${item.name} quedó marcada como vendida` : `${item.name} volvió a disponibles`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setSaving(false);
    }
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventario compartido</p>
          <h1>Mi Tienda</h1>
        </div>
        <label className="seller-picker">
          <span>Estoy usando la app como</span>
          <select value={seller} onChange={(event) => changeSeller(event.target.value)} aria-label="Quién está usando la aplicación">
            <option>Socia 1</option>
            <option>Socia 2</option>
          </select>
        </label>
      </header>

      <section className="summary" aria-label="Resumen del inventario">
        <button className={filter === "available" ? "summary-card active" : "summary-card"} onClick={() => setFilter("available")}>
          <span className="status-dot green" />
          <strong>{counts.available}</strong>
          <span>Disponibles</span>
        </button>
        <button className={filter === "sold" ? "summary-card active" : "summary-card"} onClick={() => setFilter("sold")}>
          <span className="status-dot coral" />
          <strong>{counts.sold}</strong>
          <span>Vendidas</span>
        </button>
        <button className={filter === "all" ? "summary-card active" : "summary-card"} onClick={() => setFilter("all")}>
          <span className="status-dot violet" />
          <strong>{items.length}</strong>
          <span>Total</span>
        </button>
      </section>

      <section className="toolbar">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prenda, talla o código" aria-label="Buscar prendas" />
        </label>
        <button className="add-button" onClick={() => setShowAdd(true)}><span>＋</span> Agregar prenda</button>
      </section>

      <div className="section-heading">
        <div>
          <h2>{filter === "available" ? "Listas para vender" : filter === "sold" ? "Prendas vendidas" : "Todas las prendas"}</h2>
          <p>Los cambios aparecen automáticamente en ambos celulares.</p>
        </div>
        <button className="refresh" onClick={() => loadItems()} aria-label="Actualizar inventario">↻ Actualizar</button>
      </div>

      {loading ? (
        <div className="loading-grid"><div /><div /><div /></div>
      ) : visible.length === 0 ? (
        <section className="empty-state">
          <div>👗</div>
          <h3>No hay prendas aquí</h3>
          <p>{search ? "Prueba con otra búsqueda." : "Agrega una prenda para empezar."}</p>
        </section>
      ) : (
        <section className="product-grid" aria-live="polite">
          {visible.map((item) => (
            <article className={`product-card ${item.status}`} key={item.id}>
              <div className="photo-wrap">
                {item.imageKey ? <img src={`/api/image?key=${encodeURIComponent(item.imageKey)}`} alt={item.name} /> : <div className="photo-placeholder"><span>👚</span><small>Sin foto</small></div>}
                <span className={`badge ${item.status}`}>{item.status === "available" ? "● Disponible" : "✓ Vendida"}</span>
              </div>
              <div className="product-body">
                <div className="title-row">
                  <div><h3>{item.name}</h3><p>{item.code || `Prenda #${item.id}`}</p></div>
                  <strong className="price">{money.format(item.price)}</strong>
                </div>
                <div className="tags"><span>Talla {item.size || "—"}</span><span>{item.color || "Sin color"}</span></div>
                <div className="cost-row"><span>Costo</span><strong>{money.format(item.cost)}</strong></div>
                {item.status === "sold" && (
                  <div className="sold-info"><strong>Vendida por {item.soldBy || "una socia"}</strong><span>{item.soldAt ? new Date(item.soldAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : ""}</span></div>
                )}
                {item.status === "available" ? (
                  <button className="sold-button" onClick={() => setConfirmItem(item)}>✓ Marcar como vendida</button>
                ) : (
                  <button className="restore-button" onClick={() => updateStatus(item, "available")} disabled={saving}>↶ Volver a disponible</button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {showAdd && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAdd(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <button className="modal-close" onClick={() => setShowAdd(false)} aria-label="Cerrar">×</button>
            <p className="eyebrow">Nueva entrada</p>
            <h2 id="add-title">Agregar una prenda</h2>
            <p className="modal-intro">Completa lo básico. La foto ayuda a identificarla rápido.</p>
            <form onSubmit={addItem}>
              <label className="photo-input"><span>📷</span><strong>Tomar o elegir foto</strong><small>JPG, PNG o WEBP</small><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label>
              <div className="form-grid">
                <label className="wide"><span>Nombre de la prenda *</span><input name="name" required placeholder="Ej. Vestido floral" /></label>
                <label><span>Código</span><input name="code" placeholder="VES-024" /></label>
                <label><span>Talla</span><input name="size" placeholder="M" /></label>
                <label><span>Color</span><input name="color" placeholder="Azul" /></label>
                <label><span>Costo *</span><input name="cost" type="number" min="0" required placeholder="65000" inputMode="numeric" /></label>
                <label><span>Precio de venta *</span><input name="price" type="number" min="0" required placeholder="120000" inputMode="numeric" /></label>
              </div>
              <div className="modal-actions"><button type="button" className="cancel" onClick={() => setShowAdd(false)}>Cancelar</button><button className="save" disabled={saving}>{saving ? "Guardando…" : "Guardar prenda"}</button></div>
            </form>
          </section>
        </div>
      )}

      {confirmItem && (
        <div className="modal-backdrop">
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="confirm-icon">✓</div>
            <p className="eyebrow">Confirmar venta</p>
            <h2 id="confirm-title">¿Vendiste {confirmItem.name}?</h2>
            <p>La otra socia la verá como vendida inmediatamente.</p>
            <div className="confirm-details"><span>Precio de venta</span><strong>{money.format(confirmItem.price)}</strong><span>Vendida por</span><strong>{seller}</strong></div>
            <button className="save full" onClick={() => updateStatus(confirmItem, "sold")} disabled={saving}>{saving ? "Marcando…" : "Sí, marcar como vendida"}</button>
            <button className="cancel full" onClick={() => setConfirmItem(null)}>No, volver</button>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
