# Bleed It Loud

Aplicación web para venta, consulta y control de acceso de entradas de eventos de Bleed It Loud.

## Estado de desarrollo

- Rama de trabajo: `development/bleeditloud-portal-access`
- La rama `main` se conserva como referencia estable.
- La rama de desarrollo incluye los accesos de Panel Admin y Modo Puerta, módulos separados, PWA y pruebas del backend.
- El backend Cloudflare Worker todavía no está desplegado.
- `BACKEND_API_URL` permanece vacío intencionalmente.
- `database.rules.json` es una propuesta; no se ha desplegado en Firebase.
- No se han modificado datos ni reglas del proyecto Firebase.

## Estructura

```text
index.html
manifest.json
sw.js
assets/
  icon.svg
css/
  styles.css
js/
  config.js
  core.js
  firebase.js
  landing.js
  sales.js
  tickets.js
  verification.js
  purchases.js
  scanner.js
  door.js
  payments.js
  admin.js
  imports.js
  data.js
  app.js
  pwa.js
worker/
  src/index.js
  test/worker.test.mjs
  package.json
  wrangler.jsonc
database.rules.json
SECURITY-REVIEW.md
SECURITY-SPARK-DEPLOYMENT.md
```

## Módulos del frontend

| Archivo | Responsabilidad |
|---|---|
| `config.js` | Identidades autorizadas, Firebase y estado global |
| `core.js` | Utilidades, cifrado, librerías y navegación |
| `firebase.js` | Conexión, autenticación y roles |
| `landing.js` | Pantalla principal y datos del evento |
| `sales.js` | Etapas, precios, compra y configuración |
| `tickets.js` | Seriales e índice público |
| `verification.js` | Validación de entradas para el equipo |
| `purchases.js` | Consulta y descarga de entradas del comprador |
| `scanner.js` | Cámara y lectura QR |
| `door.js` | Modo Puerta |
| `payments.js` | Aprobación y rechazo de pagos |
| `admin.js` | Listas, estadísticas, edición y gestión manual |
| `imports.js` | Importación masiva |
| `data.js` | Exportación y operaciones de datos |
| `app.js` | Arranque de la aplicación |
| `pwa.js` | Registro del Service Worker |

## Identidades de acceso

Las cuentas se validan mediante Firebase Authentication y deben coincidir con los correos configurados en `js/config.js`.

- Administrador: `admin@bleeditloud.com`
- Portero: `portero@bleeditloud.com`

No guardar contraseñas en el repositorio.

## Backend compatible con Firebase Spark

El Worker está preparado en `worker/src/index.js`. Antes de conectarlo:

1. Configurar la cuenta de servicio con permisos mínimos.
2. Guardar `GOOGLE_SERVICE_ACCOUNT_JSON` como secreto de Cloudflare.
3. Configurar los orígenes permitidos.
4. Desplegar el Worker en un entorno de pruebas.
5. Colocar su URL HTTPS en `BACKEND_API_URL`.
6. Ejecutar las pruebas de compra, aprobación, consulta y check-in con datos de prueba.

No publicar una URL ficticia ni introducir claves privadas en GitHub.

## Pruebas automáticas

Desde la carpeta `worker`:

```bash
npm install
npm run check
npm test
```

Las pruebas usan una base de datos simulada y credenciales de prueba; no modifican Firebase real.

GitHub Actions ejecuta las validaciones de sintaxis del frontend, Worker y Service Worker, además de la batería de pruebas.

## Compatibilidad de datos

No cambiar sin migración planificada:

- `FB_EVENT_ID = live-cafe-rock-2026`: identifica la ruta de datos existente en Realtime Database.
- El prefijo criptográfico `LCR26|`: forma parte de la derivación de claves utilizada para cifrar y descifrar QR ya generados.

Ambos nombres son históricos y deben mantenerse para conservar compatibilidad con los datos y entradas existentes.
