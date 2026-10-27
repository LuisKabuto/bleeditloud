# LIVE CAFÉ ROCK — revisión de seguridad y despliegue

## Cambios incluidos en esta rama

- El formulario de compra ahora valida etapa, cantidad (1–20), cédula y teléfono.
- La compra solo muestra confirmación después de que Firebase confirme que el pedido fue escrito. Si falla la conexión o los permisos, no simula un pedido local ni muestra éxito.
- El botón de envío se desactiva mientras se procesa la solicitud para evitar doble envío accidental.
- El importe se formatea para facilitar la lectura.
- Se añadió una acción para copiar los datos de pago y el total desde el teléfono.
- Las entradas consultadas por el comprador ahora tienen un flujo de descarga/compartir PNG individual.

## Acceso directo al panel

La aplicación ya reconoce las rutas `#admin` y `#portero`; por ejemplo, el panel administrativo se abre mediante `https://TU-DOMINIO/#admin`. La contraseña se valida con Firebase Authentication. La restricción real de datos debe hacerse en Firebase Realtime Database Rules, no solo ocultando botones en el navegador.

## Bloqueadores antes de producción

1. **Reglas de Firebase:** este repositorio no contiene las reglas actuales de Realtime Database. Hay que inspeccionarlas en Firebase Console y versionarlas antes de cambiar permisos. No se deben desplegar reglas nuevas a ciegas porque pueden bloquear las ventas o, peor, dejar datos accesibles.
2. **Validación de pagos y precios:** el navegador no es una autoridad confiable. El precio, el estado de la etapa, el total, el cupo y la referencia deben verificarse en una Cloud Function o API confiable. La aprobación manual del administrador debe ser la única que emita tickets.
3. **Anti-duplicados:** las referencias bancarias deben normalizarse y compararse en el servidor al recibir y aprobar un pedido; una regla de base de datos por sí sola no es suficiente para esta validación de negocio.
4. **Control de acceso atómico:** la interfaz ahora espera la transacción de Firebase y solo concede acceso si el servidor confirma que el ticket pasó de no usado a usado. Dos lectores concurrentes no deben recibir éxito para el mismo serial. Esto depende de que las reglas de Firebase permitan únicamente al personal autorizado cambiar ese campo; para una protección más sólida, migrar el check-in a una función de backend y probar con dos dispositivos.
5. **Protección de datos:** el índice público por cédula debe revisarse. Cédula y teléfono son datos personales; cifrar seriales en el cliente no sustituye el control de acceso, limitación de intentos ni protección contra enumeración.
6. **Límites de abuso:** las escrituras públicas de pedidos deben pasar a una función con validación, límites de frecuencia y protección contra spam. No se debe abrir lectura pública de `pending`, `attendees`, `tickets` ni `doorLog`.
7. **Dependencias:** fijar versiones revisadas de bibliotecas de terceros, evitar cargar scripts críticos desde CDN sin integridad cuando sea posible y actualizar runtime/dependencias del backend al desplegarlo.
8. **Copia de seguridad:** exportar una copia de los datos de Firebase antes de migraciones o cambios de reglas. No ejecutar la función de borrado de evento como parte de pruebas.

## Pruebas requeridas antes de publicar

- Compra correcta y compra con pérdida de conexión.
- Dos clics rápidos en “Enviar comprobante”.
- Cantidad vacía, decimal, cero, negativa y mayor que 20.
- Etapa cerrada y ventas pausadas.
- Pago duplicado y referencia repetida.
- Login como administrador, portero y cuenta sin rol.
- QR válido, inválido, de otro día y ya usado.
- Dos dispositivos escaneando el mismo ticket simultáneamente.
- Descarga/compartir en Android, iPhone y navegador de escritorio.
- Importación Excel con filas duplicadas, cédulas vacías y columnas inesperadas.

## Cambios nuevos preparados en la rama de seguridad

- La compra pública se registra mediante `functions.createPendingOrder`: el servidor valida campos, calcula el total con el precio configurado en Firebase y limita la frecuencia por IP.
- Se reserva la referencia bancaria mediante una transacción para evitar que dos solicitudes simultáneas usen la misma referencia.
- `functions.approvePayment` valida rol, estado, etapa y cantidad; calcula el total en servidor y actualiza solicitud, asistentes, tickets e índice mediante una transacción.
- `functions.checkInTicket` realiza la transacción de uso y escribe el registro de puerta desde el servidor. El portero ya no necesita permiso directo de escritura en tickets.
- `functions.getPublicOrderIndex` y `functions.getPublicTicketInfo` reemplazan las lecturas públicas directas del índice y de los metadatos de tickets, con límites de frecuencia y respuesta reducida.
- `database.rules.json` es una propuesta para la nueva versión: la lectura directa de tickets se restringe al personal y la lectura de `pub` al administrador.
- El frontend llama a las funciones para crear solicitudes, aprobar/rechazar pagos, consultar metadatos de tickets y confirmar ingresos.

## Estado

Los cambios están en una rama y **no están desplegados en Firebase ni integrados en `main`**. No se han modificado los datos ni las reglas de producción. Antes de producción hay que instalar dependencias, ejecutar `npm --prefix functions run lint`, probar en Firebase Emulator y desplegar las funciones antes de publicar el frontend y las reglas. Consulta `SECURITY-DEPLOYMENT.md` para el orden. Esta entrega reduce riesgos importantes, pero no es una auditoría completa; la consulta pública por cédula aún debe endurecerse y la solución necesita pruebas integradas.
