"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createInventoryItem, deleteInventoryItem, downloadPreparedFiles, listInventory, prepareAvailablePhotos, prepareInventorySale, sharePreparedContent, type ShareContent, updateInventoryItem, updateInventoryStatus } from "../lib/pocketbase";

type Item = {
  id: string;
  name: string;
  code: string;
  size: string;
  color: string;
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
  code: string;
  size: string;
  color: string;
  cost: string;
  price: string;
};

const emptyDraft: AddDraft = { name: "", code: "", size: "", color: "", cost: "", price: "" };
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
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [shareItem, setShareItem] = useState<Item | null>(null);
  const [saleShare, setSaleShare] = useState<ShareContent | null>(null);
  const [availableFiles, setAvailableFiles] = useState<File[] | null>(null);
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
    const matchesSearch = !term || `${item.name} ${item.code} ${item.size} ${item.color}`.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  }), [items, filter, search]);

  function updateDraft(field: keyof AddDraft, value: string) {
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar prenda, talla o código" aria-label="Buscar prendas" />
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
              <div className="photo-wrap">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <div className="photo-placeholder"><span>👚</span><small>Sin foto</small></div>}
                <span className={`badge ${item.status}`}>{item.status === "available" ? "● Disponible" : "✓ Vendida"}</span>
              </div>
              <div className="product-body">
                <div className="title-row">
                  <div><h3>{item.name}</h3><p>{item.code || `Prenda #${item.id.slice(0, 6)}`}</p></div>
                  <strong className="price">{money.format(item.price)}</strong>
                </div>
                <div className="tags"><span>Talla {item.size || "—"}</span><span>{item.color || "Sin color"}</span></div>
                <div className="cost-row"><span>Costo</span><strong>{money.format(item.cost)}</strong></div>
                {item.status === "sold" && (
                  <div className="sold-info"><strong>Prenda vendida</strong><span>{item.soldAt ? new Date(item.soldAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : ""}</span></div>
                )}
                {item.status === "available" ? (
                  <button className="sold-button" onClick={() => setConfirmItem(item)}>✓ Marcar como vendida</button>
                ) : (
                  <button className="restore-button" onClick={() => updateStatus(item, "available")} disabled={saving}>↶ Volver a disponible</button>
                )}
                <button className="edit-button" onClick={() => setEditItem(item)}>✎ Editar prenda</button>
                <button className="delete-button" onClick={() => setDeleteItem(item)}>⌫ Eliminar prenda</button>
              </div>
            </article>
          ))}
        </section>
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
                <label><span>Código</span><input name="code" placeholder="VES-024" value={addDraft.code} onChange={(event) => updateDraft("code", event.target.value)} /></label>
                <label><span>Talla</span><input name="size" placeholder="M" value={addDraft.size} onChange={(event) => updateDraft("size", event.target.value)} /></label>
                <label><span>Color</span><input name="color" placeholder="Azul" value={addDraft.color} onChange={(event) => updateDraft("color", event.target.value)} /></label>
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
                <label><span>Código</span><input name="code" defaultValue={editItem.code} /></label>
                <label><span>Talla</span><input name="size" defaultValue={editItem.size} /></label>
                <label><span>Color</span><input name="color" defaultValue={editItem.color} /></label>
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
            <div className="confirm-details"><span>Prenda</span><strong>{deleteItem.code || deleteItem.name}</strong><span>Estado</span><strong>{deleteItem.status === "sold" ? "Vendida" : "Disponible"}</strong></div>
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
