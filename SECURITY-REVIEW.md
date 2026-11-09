# Bleed It Loud — revisión de seguridad

## Estado del desarrollo

La rama `development/bleeditloud-portal-access` contiene la interfaz modular y una propuesta de backend compatible con Firebase Spark. No está desplegada en producción y no se han cambiado datos ni reglas reales de Firebase.

## Controles implementados en el código

- Validación de nombre, cédula, teléfono, cantidad y etapa en la API de compra.
- Cálculo del importe en el servidor usando los precios almacenados en Firebase.
- El precio queda fijado al registrar la solicitud; cambios posteriores de precio o cierre de etapa no alteran pagos ya enviados.
- La consulta informa cuando un pago fue aprobado pero el índice de QR todavía está pendiente de regeneración.
- Bloqueo de referencias bancarias duplicadas, incluso después de rechazar una solicitud.
- Aprobación y rechazo de pagos reservados al administrador.
- Emisión de seriales únicos desde el Worker.
- Check-in transaccional con ETag para impedir que dos lectores consuman el mismo serial.
- El frontend solo concede acceso después de la confirmación del Worker.
- Consulta pública de pedidos mediante cédula y teléfono juntos; los seriales se cifran antes de almacenarse en el índice público.
- Accesos diferenciados para administrador y portero mediante Firebase Authentication.
- El portero entra directamente al lector de pantalla completa y no recibe las pestañas administrativas.

## Backend y endpoints

El Worker de `worker/src/index.js` implementa:

- `createPendingOrder`
- `approvePayment`
- `rejectPayment`
- `checkInTicket`
- `setPublicIndex`
- `getPublicOrderIndex`
- `getPublicTicketInfo`

El Worker no está desplegado. `BACKEND_API_URL` permanece vacío en `js/config.js`, por lo que las operaciones críticas fallan de forma cerrada hasta configurar un endpoint HTTPS real.

## Pruebas automatizadas

GitHub Actions ejecuta validaciones de sintaxis del frontend, Service Worker y backend, comprueba las referencias locales de archivos y el JSON del manifiesto, y ejecuta 13 pruebas del Worker.

Las 13 pruebas actuales pasan. Cubren compra, cálculo de precios, referencias duplicadas, validación de cantidades, ventas cerradas, autorización administrativa, emisión de entradas, check-in, concurrencia de lectores y CORS.

Estas pruebas utilizan una base de datos simulada y credenciales ficticias. No sustituyen las pruebas de integración con una copia anonimizada de los datos reales ni las pruebas físicas con móviles.

## Riesgos y bloqueadores antes de producción

1. **Cuenta de servicio:** configurar una identidad de Google Cloud con permisos mínimos y guardar su clave únicamente como secreto `GOOGLE_SERVICE_ACCOUNT_JSON` en Cloudflare.
2. **Reglas reales de Firebase:** inspeccionar y respaldar las reglas vigentes. `database.rules.json` es una propuesta, no debe desplegarse sin verificar cada pantalla y operación.
3. **Privacidad:** el rol portero actualmente necesita leer asistentes y entradas. Revisar si debe recibir cédula y teléfono completos o si conviene crear una vista reducida de puerta.
4. **Limitación de abuso:** el rate limiter del Worker es local a cada instancia y de mejor esfuerzo; no es un límite global distribuido. Evaluar Turnstile o un mecanismo distribuido antes de abrir ventas al público.
5. **Tamaño y concurrencia:** las transacciones usan ETag sobre el nodo completo del evento. Es adecuado para el volumen previsto, pero debe medirse con datos de prueba y revisarse si crece la base.
6. **Índice público:** la aprobación y el guardado del índice cifrado son dos operaciones consecutivas. Si falla la segunda, el administrador debe regenerar el índice antes de que el comprador pueda descargar sus QR.
7. **Dependencias externas:** Tailwind, Firebase, QR, Excel y otras librerías se cargan desde CDN. Fijar y revisar versiones, y evaluar integridad SRI o alojamiento local.
8. **PWA:** el Service Worker almacena el shell y los recursos locales. No proporciona operación offline de autenticación, compras ni check-in.
9. **Respaldo y restauración:** exportar Realtime Database y comprobar una restauración antes de cambiar reglas o migrar datos.
10. **Pruebas reales:** validar compra, doble envío, pagos, importación Excel, QR válidos e inválidos, dos lectores simultáneos, cámara y descargas en Android, iPhone y escritorio.

## Decisión de publicación

**No está aprobada para producción todavía.** Primero se debe desplegar el Worker en un entorno de pruebas, conectar el frontend, revisar reglas y privacidad, ejecutar pruebas end-to-end y comprobar recuperación ante fallos.

No ejecutar la opción de borrado de evento durante las pruebas.
