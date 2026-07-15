"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createInventoryItem, deleteInventoryItem, downloadPreparedFiles, listInventory, prepareAvailablePhotos, prepareInventorySale, preparePromotionCollages, PRODUCT_CATEGORIES, PROMOTION_CATEGORIES, productCategoryLabel, productClassificationFor, promotionCategoryFor, sharePreparedContent, type ProductAudience, type ProductCategory, type PromotionCategory, type ShareContent, updateInventoryItem, updateInventoryStatus } from "../lib/pocketbase";

type Item = {
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

type AddDraft = {
  name: string;
  size: string;
  color: string;
  audience: ProductAudience;
  category: ProductCategory;
  cost: string;
  price: string;
};

const emptyDraft: AddDraft = { name: "", size: "", color: "", audience: "mujer", category: "blusas", cost: "", price: "" };
const DRAFT_KEY = "entre-primas-nueva-prenda";
const PHOTO_DRAFT_KEY = "nueva-prenda-foto";

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("entre-primas-borradores", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDraftPhoto(file: File | null) {
  const database = await openDraftDatabase();
  const transaction = database.transaction("drafts", "readwrite");
  const store = transaction.objectStore("drafts");
  if (file) store.put(file, PHOTO_DRAFT_KEY);
  else store.delete(PHOTO_DRAFT_KEY);
  transaction.oncomplete = () => database.close();
}

async function loadDraftPhoto(): Promise<File | null> {
  const database = await openDraftDatabase();
  return new Promise((resolve) => {
    const request = database.transaction("drafts", "readonly").objectStore("drafts").get(PHOTO_DRAFT_KEY);
    request.onsuccess = () => {
      const saved = request.result as File | Blob | undefined;
      database.close();
      if (!saved) return resolve(null);
      resolve(saved instanceof File ? saved : new File([saved], "foto-prenda", { type: saved.type }));
    };
    request.onerror = () => { database.close(); resolve(null); };
  });
}

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
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyDraft);
  const [draftPhoto, setDraftPhoto] = useState<File | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editAudience, setEditAudience] = useState<ProductAudience>("mujer");
  const [editCategory, setEditCategory] = useState<ProductCategory>("blusas");
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [shareItem, setShareItem] = useState<Item | null>(null);
  const [saleShare, setSaleShare] = useState<ShareContent | null>(null);
  const [availableFiles, setAvailableFiles] = useState<File[] | null>(null);
  const [collageFiles, setCollageFiles] = useState<File[] | null>(null);
  const [collageCategory, setCollageCategory] = useState<PromotionCategory | null>(null);
  const [collagePreparing, setCollagePreparing] = useState<PromotionCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadItems(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      setItems(await listInventory());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
    const timer = window.setInterval(() => loadItems(true), 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved) as AddDraft;
      if (Object.values(draft).some(Boolean)) {
        setAddDraft({ ...emptyDraft, ...draft });
        setShowAdd(true);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    loadDraftPhoto().then((photo) => {
      if (photo) {
        setDraftPhoto(photo);
        setShowAdd(true);
      }
    }).catch(() => undefined);
  }, []);

  const counts = useMemo(() => ({
    available: items.filter((item) => item.status === "available").length,
    sold: items.filter((item) => item.status === "sold").length,
  }), [items]);

  const visible = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === "all" || item.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${item.name} ${item.size} ${item.color}`.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  }), [items, filter, search]);

  const soldItems = useMemo(() => items
    .filter((item) => item.status === "sold")
    .sort((a, b) => (b.soldAt || "").localeCompare(a.soldAt || "")), [items]);

  const salesSummary = useMemo(() => soldItems.reduce((summary, item) => ({
    revenue: summary.revenue + item.price,
    cost: summary.cost + item.cost,
    profit: summary.profit + item.price - item.cost,
  }), { revenue: 0, cost: 0, profit: 0 }), [soldItems]);

  const promotionCounts = useMemo(() => {
    const countsByCategory = Object.fromEntries(PROMOTION_CATEGORIES.map((entry) => [entry.key, 0])) as Record<PromotionCategory, number>;
    items.forEach((item) => {
      if (item.status === "available" && item.originalImageUrl) countsByCategory[promotionCategoryFor(item)] += 1;
    });
    return countsByCategory;
  }, [items]);

  function updateDraft<K extends keyof AddDraft>(field: K, value: AddDraft[K]) {
    setAddDraft((current) => {
      const next = { ...current, [field]: value };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  }

  function closeAddForm() {
    setShowAdd(false);
    setAddDraft(emptyDraft);
    setDraftPhoto(null);
    window.localStorage.removeItem(DRAFT_KEY);
    saveDraftPhoto(null).catch(() => undefined);
  }

  function beginEdit(item: Item) {
    const classification = productClassificationFor(item);
    setEditAudience(classification.audience);
    setEditCategory(classification.category);
    setEditItem(item);
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    try {
      const formData = new FormData(form);
      const selectedPhoto = formData.get("photo");
      if (!(selectedPhoto instanceof File) || selectedPhoto.size === 0) {
        if (draftPhoto) formData.set("photo", draftPhoto);
      }
      const item = await createInventoryItem(formData);
      setItems((current) => [item, ...current]);
      setShowAdd(false);
      setAddDraft(emptyDraft);
      setDraftPhoto(null);
      window.localStorage.removeItem(DRAFT_KEY);
      saveDraftPhoto(null).catch(() => undefined);
      form.reset();
      flash("Prenda agregada al inventario");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setSaving(false);
    }
  }

  async function editInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editItem) return;
    setSaving(true);
    try {
      const updated = await updateInventoryItem(editItem.id, new FormData(event.currentTarget));
      setItems((current) => current.map((row) => row.id === updated.id ? updated : row));
      setEditItem(null);
      flash(`${updated.name} quedó actualizada`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar la prenda");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Item, status: "available" | "sold") {
    setSaving(true);
    try {
      const updated = await updateInventoryStatus(item.id, status);
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      setConfirmItem(null);
      if (status === "sold") {
        setSaleShare(null);
        setShareItem(updated);
        prepareInventorySale(updated)
          .then(setSaleShare)
          .catch((error) => setNotice(error instanceof Error ? error.message : "No se pudo preparar la foto para compartir"));
        flash(`${item.name} quedó marcada como vendida`);
      } else {
        flash(`${item.name} volvió a disponibles`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ocurrió un problema");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item: Item) {
    setSaving(true);
    try {
      await deleteInventoryItem(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setDeleteItem(null);
      flash(`${item.name} fue eliminada del inventario`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo eliminar la prenda");
    } finally {
      setSaving(false);
    }
  }

  async function downloadAllPhotos() {
    setDownloading(true);
    try {
      setAvailableFiles(await prepareAvailablePhotos(items));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron descargar las fotos");
    } finally {
      setDownloading(false);
    }
  }

  async function saveOrShareAvailablePhotos() {
    if (!availableFiles) return;
    try {
      const shared = await sharePreparedContent({
        title: "Prendas disponibles · Entre Primas",
        text: "Fotos de las prendas disponibles de Entre Primas",
        files: availableFiles,
      });
      if (!shared) {
        downloadPreparedFiles(availableFiles);
        flash("Las fotos se descargaron por separado en JPG");
      }
      setAvailableFiles(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "No se pudieron guardar las fotos");
    }
  }

  async function createPromotionCollages(category: PromotionCategory) {
    setCollagePreparing(category);
    try {
      const files = await preparePromotionCollages(items, category);
      setCollageCategory(category);
      setCollageFiles(files);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron crear los collages");
    } finally {
      setCollagePreparing(null);
    }
  }

  async function saveOrShareCollages() {
    if (!collageFiles || !collageCategory) return;
    const category = PROMOTION_CATEGORIES.find((entry) => entry.key === collageCategory);
    try {
      const shared = await sharePreparedContent({
        title: `${category?.label || "Productos"} disponibles · Entre Primas`,
        text: `${category?.label || "Productos"} disponibles en Entre Primas`,
        files: collageFiles,
      });
      if (!shared) {
        downloadPreparedFiles(collageFiles);
        flash(`${collageFiles.length} collage${collageFiles.length === 1 ? "" : "s"} guardado${collageFiles.length === 1 ? "" : "s"} en JPG`);
      }
      setCollageFiles(null);
      setCollageCategory(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "No se pudieron compartir los collages");
    }
  }

  async function shareSale() {
    if (!saleShare) return;
    try {
      const shared = await sharePreparedContent(saleShare);
      if (!shared) {
        setNotice("Para enviar la foto a WhatsApp desde el celular, abre la versión publicada con conexión segura HTTPS.");
        return;
      }
      setShareItem(null);
      setSaleShare(null);
      flash("Elige WhatsApp y luego el grupo Entre Primas");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "No se pudo abrir el menú para compartir");
    }
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src="/entre-primas-logo.png" alt="Entre Primas, Belleza y Moda" />
          <div className="brand-copy">
            <p className="eyebrow">Control de prendas</p>
            <h1>Inventario compartido</h1>
          </div>
        </div>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prenda, talla o color" aria-label="Buscar prendas" />
        </label>
        <div className="toolbar-actions">
          <button className="bulk-download-button" onClick={downloadAllPhotos} disabled={downloading}><span>↓</span> {downloading ? "Guardando fotos…" : "Descargar todas las fotos"}</button>
          <button className="add-button" onClick={() => setShowAdd(true)}><span>＋</span> Agregar prenda</button>
        </div>
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
              <button type="button" className="photo-wrap product-preview-button" onClick={() => setDetailItem(item)} aria-label={`Ver detalles de ${item.name}`}>
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <div className="photo-placeholder"><span>👚</span><small>Sin foto</small></div>}
                <span className={`badge ${item.status}`}>{item.status === "available" ? "● Disponible" : "✓ Vendida"}</span>
                <span className="view-hint">Ver detalles</span>
              </button>
              <div className="product-body">
                <div className="title-row">
                  <div><button type="button" className="product-title-button" onClick={() => setDetailItem(item)}>{item.name}</button></div>
                  <strong className="price">{money.format(item.price)}</strong>
                </div>
                <div className="tags"><span>{productCategoryLabel(item)}</span><span>Talla {item.size || "—"}</span><span>{item.color || "Sin color"}</span></div>
                <div className="cost-row"><span>Costo</span><strong>{money.format(item.cost)}</strong></div>
                {item.status === "sold" && (
                  <div className="sold-info"><strong>Prenda vendida</strong><span>{item.soldAt ? new Date(item.soldAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : ""}</span></div>
                )}
                {item.status === "available" ? (
                  <button className="sold-button" onClick={() => setConfirmItem(item)}>✓ Marcar como vendida</button>
                ) : (
                  <button className="restore-button" onClick={() => updateStatus(item, "available")} disabled={saving}>↶ Volver a disponible</button>
                )}
                <button className="edit-button" onClick={() => beginEdit(item)}>✎ Editar prenda</button>
                <button className="delete-button" onClick={() => setDeleteItem(item)}>⌫ Eliminar prenda</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="business-section sales-section" aria-labelledby="sales-title">
        <div className="business-heading">
          <div>
            <p className="eyebrow">Resultados del negocio</p>
            <h2 id="sales-title">Resumen de ventas</h2>
            <p>Se calcula automáticamente con las prendas marcadas como vendidas.</p>
          </div>
          <span className="section-pill">{soldItems.length} venta{soldItems.length === 1 ? "" : "s"}</span>
        </div>
        <div className="finance-grid">
          <article className="finance-card revenue-card"><span>Total vendido</span><strong>{money.format(salesSummary.revenue)}</strong><small>Todo el dinero recibido</small></article>
          <article className="finance-card cost-card"><span>Costos</span><strong>{money.format(salesSummary.cost)}</strong><small>Lo invertido en lo vendido</small></article>
          <article className="finance-card profit-card"><span>Ganancia</span><strong>{money.format(salesSummary.profit)}</strong><small>Ventas menos costos</small></article>
        </div>
        {soldItems.length > 0 ? (
          <div className="sales-list">
            <div className="sales-list-head"><strong>Prenda vendida</strong><strong>Venta</strong><strong>Ganancia</strong></div>
            {soldItems.map((item) => (
              <div className="sales-list-row" key={`sale-${item.id}`}>
                <div><strong>{item.name}</strong><small>{item.soldAt ? new Date(item.soldAt).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "Vendida"}</small></div>
                <strong>{money.format(item.price)}</strong>
                <strong className={item.price - item.cost >= 0 ? "positive-profit" : "negative-profit"}>{money.format(item.price - item.cost)}</strong>
              </div>
            ))}
          </div>
        ) : <p className="business-empty">Cuando marques la primera venta, aquí aparecerán los totales y la ganancia.</p>}
      </section>

      <section className="business-section promotion-section" aria-labelledby="promotion-title">
        <div className="business-heading">
          <div>
            <p className="eyebrow">Material para estados</p>
            <h2 id="promotion-title">Promocionar productos disponibles</h2>
            <p>La aplicación organiza los productos por su nombre y crea collages con el logo de Entre Primas.</p>
          </div>
        </div>
        {(["mujer", "hombre"] as ProductAudience[]).map((audience) => (
          <div className="promotion-audience" key={audience}>
            <h3>{audience === "mujer" ? "Productos para mujer" : "Productos para hombre"}</h3>
            <div className="promotion-grid">
              {PROMOTION_CATEGORIES.filter((category) => category.audience === audience).map((category) => {
                const count = promotionCounts[category.key];
                const collageCount = Math.ceil(count / 4);
                return (
                  <article className="promotion-card" key={category.key}>
                    <div className="promotion-icon">{category.icon}</div>
                    <div className="promotion-copy"><h3>{category.label}</h3><p>{count} disponible{count === 1 ? "" : "s"} con foto</p>{count > 4 && <small>Se crearán {collageCount} collages equilibrados</small>}</div>
                    <button onClick={() => createPromotionCollages(category.key)} disabled={count === 0 || collagePreparing !== null}>
                      {collagePreparing === category.key ? "Creando…" : "Crear collage"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
        <p className="category-help">Las prendas nuevas usan la categoría elegida. Las prendas antiguas siguen clasificándose automáticamente por su nombre hasta que las edites.</p>
      </section>

      {detailItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDetailItem(null)}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="modal-close detail-close" onClick={() => setDetailItem(null)} aria-label="Cerrar">×</button>
            <div className="detail-photo">
              {detailItem.imageUrl ? <img src={detailItem.imageUrl} alt={detailItem.name} /> : <div className="photo-placeholder"><span>👚</span><small>Sin foto</small></div>}
              <span className={`badge ${detailItem.status}`}>{detailItem.status === "available" ? "● Disponible" : "✓ Vendida"}</span>
            </div>
            <div className="detail-content">
              <p className="eyebrow">{productClassificationFor(detailItem).audience === "hombre" ? "Para hombre" : "Para mujer"} · {productCategoryLabel(detailItem)}</p>
              <h2 id="detail-title">{detailItem.name}</h2>
              <div className="detail-grid">
                <div><span>Talla</span><strong>{detailItem.size || "Sin talla"}</strong></div>
                <div><span>Color</span><strong>{detailItem.color || "Sin color"}</strong></div>
                <div><span>Costo</span><strong>{money.format(detailItem.cost)}</strong></div>
                <div className="detail-price"><span>Precio de venta</span><strong>{money.format(detailItem.price)}</strong></div>
                <div className="detail-profit"><span>Ganancia esperada</span><strong>{money.format(detailItem.price - detailItem.cost)}</strong></div>
              </div>
              {detailItem.status === "sold" && detailItem.soldAt && <p className="detail-sold-date">Vendida el {new Date(detailItem.soldAt).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}</p>}
              <button className="edit-button detail-edit" onClick={() => { setDetailItem(null); beginEdit(detailItem); }}>✎ Editar esta prenda</button>
            </div>
          </section>
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAddForm()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <button className="modal-close" onClick={closeAddForm} aria-label="Cerrar">×</button>
            <p className="eyebrow">Nueva entrada</p>
            <h2 id="add-title">Agregar una prenda</h2>
            <p className="modal-intro">Completa lo básico. Guardamos el texto automáticamente si sales un momento de la página.</p>
            <form onSubmit={addItem}>
              <label className="photo-input"><span>📷</span><strong>{draftPhoto ? `Foto guardada: ${draftPhoto.name}` : "Tomar o elegir foto"}</strong><small>{draftPhoto ? "Puedes continuar; la foto no se perderá." : "JPG, PNG o WEBP"}</small><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setDraftPhoto(file); saveDraftPhoto(file).catch(() => undefined); }} /></label>
              <div className="form-grid">
                <label className="wide"><span>Nombre de la prenda *</span><input name="name" required placeholder="Ej. Vestido floral" value={addDraft.name} onChange={(event) => updateDraft("name", event.target.value)} /></label>
                <label><span>Talla</span><input name="size" placeholder="M" value={addDraft.size} onChange={(event) => updateDraft("size", event.target.value)} /></label>
                <label><span>Color</span><input name="color" placeholder="Azul" value={addDraft.color} onChange={(event) => updateDraft("color", event.target.value)} /></label>
                <label><span>¿Para quién es? *</span><select name="audience" value={addDraft.audience} onChange={(event) => { const audience = event.target.value as ProductAudience; updateDraft("audience", audience); updateDraft("category", PRODUCT_CATEGORIES[audience][0].key); }}><option value="mujer">Mujer</option><option value="hombre">Hombre</option></select></label>
                <label><span>Tipo de producto *</span><select name="category" value={addDraft.category} onChange={(event) => updateDraft("category", event.target.value as ProductCategory)}>{PRODUCT_CATEGORIES[addDraft.audience].map((category) => <option value={category.key} key={category.key}>{category.label}</option>)}</select></label>
                <label><span>Costo *</span><input name="cost" type="number" min="0" required placeholder="65000" inputMode="numeric" value={addDraft.cost} onChange={(event) => updateDraft("cost", event.target.value)} /></label>
                <label><span>Precio de venta *</span><input name="price" type="number" min="0" required placeholder="120000" inputMode="numeric" value={addDraft.price} onChange={(event) => updateDraft("price", event.target.value)} /></label>
              </div>
              <div className="modal-actions"><button type="button" className="cancel" onClick={closeAddForm}>Cancelar</button><button className="save" disabled={saving}>{saving ? "Guardando…" : "Guardar prenda"}</button></div>
            </form>
          </section>
        </div>
      )}

      {editItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditItem(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <button className="modal-close" onClick={() => setEditItem(null)} aria-label="Cerrar">×</button>
            <p className="eyebrow">Corregir información</p>
            <h2 id="edit-title">Editar prenda</h2>
            <p className="modal-intro">Cambia solamente lo necesario y pulsa Guardar cambios.</p>
            <form onSubmit={editInventoryItem}>
              <label className="photo-input">
                <span>📷</span>
                <strong>{editItem.imageUrl ? "Cambiar foto (opcional)" : "Agregar foto (opcional)"}</strong>
                <small>Si no eliges otra foto, se conserva la actual.</small>
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" />
              </label>
              <div className="form-grid">
                <label className="wide"><span>Nombre de la prenda *</span><input name="name" required defaultValue={editItem.name} /></label>
                <label><span>Talla</span><input name="size" defaultValue={editItem.size} /></label>
                <label><span>Color</span><input name="color" defaultValue={editItem.color} /></label>
                <label><span>¿Para quién es? *</span><select name="audience" value={editAudience} onChange={(event) => { const audience = event.target.value as ProductAudience; setEditAudience(audience); setEditCategory(PRODUCT_CATEGORIES[audience][0].key); }}><option value="mujer">Mujer</option><option value="hombre">Hombre</option></select></label>
                <label><span>Tipo de producto *</span><select name="category" value={editCategory} onChange={(event) => setEditCategory(event.target.value as ProductCategory)}>{PRODUCT_CATEGORIES[editAudience].map((category) => <option value={category.key} key={category.key}>{category.label}</option>)}</select></label>
                <label><span>Costo *</span><input name="cost" type="number" min="0" required inputMode="numeric" defaultValue={editItem.cost} /></label>
                <label><span>Precio de venta *</span><input name="price" type="number" min="0" required inputMode="numeric" defaultValue={editItem.price} /></label>
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel" onClick={() => setEditItem(null)}>Cancelar</button>
                <button className="save" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
              </div>
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
            <div className="confirm-details"><span>Precio de venta</span><strong>{money.format(confirmItem.price)}</strong></div>
            <button className="save full" onClick={() => updateStatus(confirmItem, "sold")} disabled={saving}>{saving ? "Marcando…" : "Sí, marcar como vendida"}</button>
            <button className="cancel full" onClick={() => setConfirmItem(null)}>No, volver</button>
          </section>
        </div>
      )}

      {deleteItem && (
        <div className="modal-backdrop">
          <section className="confirm-modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="confirm-icon danger-icon">!</div>
            <p className="eyebrow danger-text">Eliminar prenda</p>
            <h2 id="delete-title">¿Eliminar {deleteItem.name}?</h2>
            <p>Se borrará del inventario y esta acción no se puede deshacer.</p>
            <div className="confirm-details"><span>Prenda</span><strong>{deleteItem.name}</strong><span>Estado</span><strong>{deleteItem.status === "sold" ? "Vendida" : "Disponible"}</strong></div>
            <button className="danger-button full" onClick={() => removeItem(deleteItem)} disabled={saving}>{saving ? "Eliminando…" : "Sí, eliminar definitivamente"}</button>
            <button className="cancel full" onClick={() => setDeleteItem(null)} disabled={saving}>No, conservarla</button>
          </section>
        </div>
      )}

      {availableFiles && (
        <div className="modal-backdrop">
          <section className="confirm-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="photos-ready-title">
            <div className="confirm-icon">{availableFiles.length}</div>
            <p className="eyebrow">Fotos preparadas</p>
            <h2 id="photos-ready-title">Todas están listas en JPG</h2>
            <p>En iPhone o Android, pulsa el botón y elige guardar las imágenes. También puedes elegir WhatsApp para publicarlas o enviarlas.</p>
            <button className="save full" onClick={saveOrShareAvailablePhotos}>Abrir opciones para guardar</button>
            <button className="cancel full" onClick={() => setAvailableFiles(null)}>Cancelar</button>
          </section>
        </div>
      )}

      {collageFiles && collageCategory && (
        <div className="modal-backdrop">
          <section className="confirm-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="collages-ready-title">
            <div className="confirm-icon">{collageFiles.length}</div>
            <p className="eyebrow">Collages listos</p>
            <h2 id="collages-ready-title">{PROMOTION_CATEGORIES.find((entry) => entry.key === collageCategory)?.label} listas para promocionar</h2>
            <p>Cada collage está en JPG, muestra hasta cuatro productos disponibles y lleva el logo de Entre Primas en el centro.</p>
            <button className="save full" onClick={saveOrShareCollages}>Guardar o compartir collages</button>
            <button className="cancel full" onClick={() => { setCollageFiles(null); setCollageCategory(null); }}>Cancelar</button>
          </section>
        </div>
      )}

      {shareItem && (
        <div className="modal-backdrop">
          <section className="confirm-modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            {shareItem.imageUrl ? <img className="share-preview" src={shareItem.imageUrl} alt={shareItem.name} /> : <div className="confirm-icon">✓</div>}
            <p className="eyebrow">Venta registrada</p>
            <h2 id="share-title">Compartir en Entre Primas</h2>
            <p>El teléfono abrirá su menú para compartir la foto JPG y el mensaje. Elige WhatsApp y luego el grupo “Entre Primas”.</p>
            <button className="whatsapp-button full" onClick={shareSale} disabled={!saleShare}>{saleShare ? "Compartir foto y mensaje" : "Preparando foto…"}</button>
            <button className="cancel full" onClick={() => { setShareItem(null); setSaleShare(null); }}>Ahora no</button>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
