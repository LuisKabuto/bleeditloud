# Bleed It Loud — migración segura compatible con Firebase Spark

## Estado actual
- La rama prepara un Worker para Cloudflare y adapta el frontend a esa API.
- No está integrado en \`main\`, no está desplegado y no se han modificado datos ni reglas de producción.
- Firebase sigue siendo la base de datos y el proveedor de inicio de sesión.
- No se requiere activar el plan Blaze para desplegar este backend, pero el nivel gratuito de Cloudflare tiene límites y puede cambiar.

## Pasos antes de publicar

1. **Respaldo:** exportar una copia de Realtime Database desde Firebase Console. No ejecutar reglas nuevas sobre la base activa sin una prueba de restauración.
2. **Cuenta de servicio:** en Google Cloud Console del proyecto \`bleeditloud-6fb33\`, crear/seleccionar una cuenta de servicio con permisos mínimos suficientes para Realtime Database. Generar una clave JSON solo si la política de la cuenta lo permite. La clave es un secreto de servidor: no subirla a GitHub ni incluirla en \`index.html\`.
3. **Worker:** seguir \`worker/README.md\`; configurar \`GOOGLE_SERVICE_ACCOUNT_JSON\` como secreto de Cloudflare. Verificar la URL del Worker.
4. **Frontend:** colocar la URL real del Worker en \`BACKEND_API_URL\` dentro de \`index.html\`. No publicar mientras esté vacía.
5. **Reglas:** revisar las reglas reales de producción antes de cambiar permisos. El Worker usa una cuenta de servicio y el navegador todavía necesita lectura de datos para el panel autenticado. No desplegar reglas desde esta rama sin verificar cada pantalla y operación.
6. **Pruebas de compra:** una compra válida registra una solicitud pendiente y calcula el total con el precio guardado en Firebase; un campo inválido, etapa cerrada o venta pausada debe fallar sin registrar una solicitud.
7. **Referencia duplicada:** enviar dos compras con la misma referencia debe aceptar como máximo una. Rechazar una solicitud no debe permitir reutilizar una referencia bancaria.
8. **Aprobación:** solo \`admin@bleeditloud.com\` puede aprobar o rechazar; un pago aprobado debe generar exactamente la cantidad de entradas pagadas y actualizar el índice público.
9. **Consulta del comprador:** una cédula sin el teléfono correcto no debe revelar si existen entradas; cédula y teléfono correctos deben permitir ver los QR de una compra aprobada; una compra pendiente debe mostrar el estado pendiente.
10. **Acceso:** el serial debe aceptarse una sola vez. Una segunda lectura debe indicar que ya fue usado. Si el Worker no responde, el sistema no debe autorizar el acceso.
11. **Compatibilidad:** probar en móvil y escritorio, descarga de QR, lista administrativa, estadísticas, importación/exportación, configuración del evento y cierre de sesión.
12. **Publicación:** integrar y desplegar solo después de pasar todas las pruebas. Mantener la versión publicada anterior disponible para reversión.

## Riesgos conocidos
- El limitador de frecuencia del Worker es local a cada instancia y puede no ser un límite global bajo tráfico distribuido.
- La actualización atómica sobre el nodo completo \`events/live-cafe-rock-2026\` depende de ETag y puede entrar en conflicto con cambios simultáneos. Si falla repetidamente, no se debe repetir la aprobación a ciegas; primero comprobar si la solicitud ya fue procesada.
- La aprobación y la actualización del índice público son dos llamadas consecutivas. Si la primera tiene éxito y la segunda falla, la entrada queda emitida pero el comprador podría no ver sus QR hasta que un administrador regenere el índice.
- La base de datos existente puede tener formatos heredados. La prueba debe usar una copia real anonimizada y no solo datos inventados.
