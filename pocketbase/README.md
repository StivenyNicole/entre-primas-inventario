# PocketBase para Mi Tienda

La aplicación usa la colección `clothing_inventory` y guarda allí tanto los datos de cada prenda como su foto.

## Crear la colección

1. Abre el panel de administración de PocketBase.
2. En **Settings → Import collections**, selecciona `clothing-inventory-schema.json`.
3. Confirma la importación.

Si la colección ya existe, vuelve a importar el mismo archivo y confirma la actualización. PocketBase conservará los registros y añadirá los campos opcionales `audience` y `category` usados para organizar los collages.

El esquema habilita lectura, creación, actualización y eliminación sin autenticación para que la aplicación sea de una sola vista. La interfaz siempre pide confirmación antes de eliminar. Antes de hacer pública la aplicación conviene añadir una clave compartida o autenticación sencilla.

## Configuración

La URL predeterminada es `https://base.pocketstiven.com`. Para usar otra instalación, copia `.env.example` como `.env.local` y cambia `NEXT_PUBLIC_POCKETBASE_URL`.

Las fotos se reducen en el navegador a un máximo de 1600 px y se convierten a WEBP antes de subirse. Esto evita el error de carga que producían las fotos grandes del celular.
