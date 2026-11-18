# Bleed It Loud — migración segura compatible con Firebase Spark

## Estado actual

- Rama de desarrollo: `development/bleeditloud-portal-access`.
- El frontend ya utiliza la API Worker para compras, aprobación/rechazo, consulta pública y check-in.
- El Worker está en el repositorio, pero todavía no está desplegado.
- `BACKEND_API_URL` está vacío en `js/config.js`.
- Firebase sigue siendo la base de datos y el proveedor de inicio de sesión.
- No se requiere Firebase Blaze para alojar el Worker en Cloudflare; se deben verificar los límites y condiciones vigentes del plan gratuito.
- No se han modificado datos ni reglas reales de producción.
- `database.rules.json` es una propuesta pendiente de revisión.

## Validación automatizada completada

GitHub Actions valida:
- Sintaxis de todos los módulos JavaScript, el Service Worker y el Worker.
- Referencias locales de CSS, JavaScript, icono y manifiesto.
- Formato JSON de `manifest.json`.
- 13 pruebas automatizadas del Worker: 13 aprobadas, 0 fallidas.

Las pruebas usan una base de datos simulada; no escriben en Firebase real.

## Pasos pendientes antes de publicar

1. **Respaldo:** exportar Realtime Database desde Firebase Console y comprobar que se puede restaurar una copia de prueba.
2. **Cuenta de servicio:** crear o seleccionar una cuenta de servicio de Google Cloud con permisos mínimos para Realtime Database. No subir su clave JSON al repositorio.
3. **Secreto Cloudflare:** guardar el JSON como secreto `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. **Orígenes permitidos:** revisar `ALLOWED_ORIGINS` en `worker/wrangler.jsonc`; incluir solo los dominios usados por el frontend de pruebas y el dominio final.
5. **Worker de pruebas:** ejecutar `npm install`, `npm run check`, `npm test` y desplegar primero a un entorno de pruebas con `npm run deploy`.
6. **Conexión frontend:** configurar la URL HTTPS real del Worker en `BACKEND_API_URL` dentro de `js/config.js`. No usar una URL ficticia ni dejar el valor vacío en un despliegue funcional.
7. **Reglas Firebase:** revisar las reglas reales y comparar con `database.rules.json`. No desplegar el archivo propuesto sin validar permisos de administrador, portero, compradores y Worker.
8. **Compra:** comprobar cálculo de precios, etapas cerradas, ventas pausadas, cantidades límite y pérdida de conexión.
9. **Anti-duplicados:** enviar referencias repetidas y verificar que se acepte como máximo una, incluso si una solicitud fue rechazada.
10. **Aprobación:** confirmar que solo el administrador pueda aprobar/rechazar y que se emita la cantidad exacta de entradas.
11. **Consulta:** probar cédula y teléfono correctos e incorrectos, solicitudes pendientes y QR cifrados.
12. **Puerta:** probar serial válido, inexistente, usado, de otro día y dos lectores concurrentes. Si el Worker no responde, nunca conceder acceso.
13. **Compatibilidad:** probar panel, estadísticas, edición, importación/exportación, cámara, descargas y cierre de sesión en dispositivos reales.
14. **Publicación:** integrar solo después de superar las pruebas; conservar una versión anterior para reversión.

## Riesgos conocidos

- El rate limiter actual se almacena en memoria de cada instancia Worker y no es un límite global distribuido.
- Las operaciones de compra, aprobación y check-in usan ETag sobre el nodo completo `events/live-cafe-rock-2026`. Si hay conflictos repetidos, comprobar primero el estado en la base antes de reintentar manualmente.
- La aprobación y actualización del índice público son llamadas consecutivas. Si la primera tiene éxito y la segunda falla, se debe regenerar el índice público.
- Los datos existentes pueden tener formatos heredados. Probar con una copia anonimizada antes de tocar la base real.
- El Service Worker almacena los recursos locales del shell, pero la autenticación, el backend y el control de acceso requieren conexión.

