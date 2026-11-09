# Bleed It Loud

Aplicación web para venta, consulta y control de acceso de entradas de eventos de Bleed It Loud.

## Estado de desarrollo

- Rama de trabajo: `development/bleeditloud-portal-access`
- La rama `main` se conserva como referencia estable.
- La rama de desarrollo incluye accesos de Panel Admin y Modo Puerta, módulos separados, PWA y pruebas del backend.
- El backend Cloudflare Worker todavía no está desplegado.
- `BACKEND_API_URL` permanece vacío intencionalmente.
- `database.rules.json` es una propuesta; no se ha desplegado en Firebase.
- No se han modificado datos ni reglas del proyecto Firebase.

## Estructura

```text
index.html
manifest.json
sw.js
assets/icon.svg
css/styles.css
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

## Responsabilidad de los módulos

- `config.js`: identidades autorizadas, configuración Firebase y estado global.
- `core.js`: utilidades, cifrado, librerías y navegación.
- `firebase.js`: conexión, autenticación y roles.
- `landing.js`: pantalla principal.
- `sales.js`: etapas, precios, compra y configuración.
- `tickets.js`: seriales e índice público.
- `verification.js`: validación para el equipo.
- `purchases.js`: consulta y descarga de entradas.
- `scanner.js`: cámara y lectura QR.
- `door.js`: Modo Puerta.
- `payments.js`: aprobación y rechazo de pagos.
- `admin.js`: listas, estadísticas y gestión manual.
- `imports.js`: importación masiva.
- `data.js`: exportación y operaciones de datos.
- `app.js`: arranque.
- `pwa.js`: registro del Service Worker.

## Accesos

Firebase Authentication valida las cuentas configuradas en `js/config.js`:

- Administrador: `admin@bleeditloud.com`
- Portero: `portero@bleeditloud.com`

No guardar contraseñas en el repositorio.

## Backend Firebase Spark

El Worker está preparado en `worker/src/index.js`. Antes de conectarlo:

1. Configurar una cuenta de servicio con permisos mínimos.
2. Guardar `GOOGLE_SERVICE_ACCOUNT_JSON` como secreto de Cloudflare.
3. Configurar los orígenes permitidos.
4. Desplegar el Worker en un entorno de pruebas.
5. Colocar su URL HTTPS en `BACKEND_API_URL`.
6. Probar compras, aprobación, consulta y check-in con datos de prueba.

No subir claves privadas a GitHub.

## Pruebas

Desde `worker/`:

```bash
npm install
npm run check
npm test
```

Las pruebas utilizan una base de datos simulada y no modifican Firebase real. GitHub Actions ejecuta las comprobaciones automáticamente.

## Compatibilidad de datos

No cambiar sin una migración planificada:

- `FB_EVENT_ID = live-cafe-rock-2026`: identifica la ruta de datos existente.
- El prefijo criptográfico `LCR26|`: forma parte de la derivación de claves para los QR existentes.

Son identificadores históricos que deben mantenerse para conservar compatibilidad.
