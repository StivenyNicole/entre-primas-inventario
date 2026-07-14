# Entre Primas — Inventario compartido

Aplicación móvil para registrar prendas, corregir sus datos, marcar ventas y compartir fotos por WhatsApp. Los registros y las imágenes se almacenan en PocketBase.

## Desarrollo local

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

La dirección de PocketBase se configura en `.env.local`:

```env
NEXT_PUBLIC_POCKETBASE_URL=https://base.pocketstiven.com
```

## Publicación con GitHub y Cloudflare

El proyecto se despliega como Cloudflare Worker; no es compatible con GitHub Pages porque utiliza la ruta de servidor `/api/photo`.

1. Sube este repositorio a GitHub.
2. En Cloudflare, abre **Workers & Pages** y conecta el repositorio desde **Import a repository**.
3. Usa la rama de producción `main`.
4. Configura el comando de compilación como `npm run build`.
5. Configura el comando de despliegue como `npx wrangler deploy`.
6. No configures un directorio de salida: Wrangler utiliza `wrangler.jsonc` y `dist/client` automáticamente.
7. En el Worker publicado, abre **Settings → Domains & Routes → Add → Custom domain** y selecciona el dominio o subdominio.

Cloudflare proporciona HTTPS automáticamente. Esto permite usar el menú nativo para guardar o compartir fotografías tanto en iPhone como en Android.

## Archivos que no se suben

El archivo `.gitignore` excluye dependencias, compilaciones, datos locales y secretos, incluyendo `node_modules`, `dist`, `.vinext`, `.wrangler` y `.env.local`.

La plantilla `.env.example` sí debe permanecer en GitHub.
