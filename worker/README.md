# Backend compatible con Firebase Spark

Este backend reemplaza las operaciones críticas que estaban preparadas para Cloud Functions. No está desplegado ni debe considerarse listo para producción hasta completar la lista de pruebas de `SECURITY-SPARK-DEPLOYMENT.md`.

## Requisitos
- Node.js 22 LTS (recomendado para herramientas de despliegue).
- Cuenta Cloudflare con Workers.
- Permisos de administrador sobre el proyecto Firebase `bleeditloud-6fb33`.

## Desarrollo y despliegue
Desde esta carpeta:

```bash
npm install
npm run check
npx wrangler login
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npm run deploy
```

Cuando Wrangler solicite el secreto, pega el contenido completo del archivo JSON de una cuenta de servicio autorizada para leer y escribir en Firebase Realtime Database. No guardes ese JSON en GitHub, en el frontend ni en un archivo versionado.

Antes de desplegar, revisa `wrangler.jsonc`: `ALLOWED_ORIGINS` debe contener únicamente los orígenes desde los que se sirve la aplicación. El nombre por defecto del Worker es `bleeditloud-api`.

Después del despliegue, Wrangler mostrará la URL `https://bleeditloud-api.<tu-subdominio>.workers.dev`. Configúrala como `BACKEND_API_URL` en `index.html` y publica el frontend solo tras terminar las pruebas de seguridad.

El Worker valida el token de Firebase Authentication para las acciones administrativas. La cuenta de servicio del Worker debe tener permisos de Realtime Database adecuados. La API de Firebase Authentication debe estar disponible para verificar tokens.

## Limitaciones
- Los límites de frecuencia actuales se guardan en memoria del Worker y son de mejor esfuerzo; no constituyen un límite global distribuido.
- Las operaciones de compra y aprobación usan ETag/transacciones sobre el nodo completo del evento para mantener cambios atómicos. Es apropiado para el volumen pequeño previsto, pero debe revisarse si el tamaño de la base crece.
- No desplegar reglas de base de datos nuevas sin probar primero la aplicación con una copia de datos.
