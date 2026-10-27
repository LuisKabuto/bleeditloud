# Despliegue seguro de LIVE CAFÉ ROCK

## Qué se añadió

- Cloud Functions en `functions/index.js` para registrar compras con precio calculado en servidor, reservar referencias bancarias, aprobar pagos, validar entradas y consultar los metadatos mínimos de un serial.
- Límites por IP para compra, consulta del índice y consulta de seriales.
- `database.rules.json` como propuesta versionada de reglas. Restringe las lecturas directas de `pub` y `tickets` a personal autenticado; el comprador consulta mediante funciones.
- El navegador utiliza las funciones para crear solicitudes, aprobar/rechazar pagos, consultar datos mínimos de un serial y marcar una entrada como usada.

## Antes de desplegar

1. Exporta una copia de seguridad de Realtime Database desde Firebase Console.
2. Verifica que el proyecto seleccionado sea `bleeditloud-6fb33` y que Authentication tenga las cuentas autorizadas de administrador y portero.
3. En una copia de prueba, instala Firebase CLI y Node.js 20.
4. Desde la raíz del repositorio ejecuta:

```bash
npm --prefix functions install
npm --prefix functions run lint
firebase login
firebase use bleeditloud-6fb33
firebase emulators:start --only functions,database,auth
```

5. Prueba la aplicación apuntando a los emuladores antes de tocar producción. Las pruebas mínimas están enumeradas en `SECURITY-REVIEW.md`.
6. Despliega primero las funciones:

```bash
firebase deploy --only functions --project bleeditloud-6fb33
```

7. Publica el frontend de esta rama únicamente después de confirmar que las funciones están desplegadas y que las compras, la aprobación y el check-in funcionan.
8. Las reglas del archivo `database.rules.json` se deben publicar por separado, después de comprobar los permisos de cada flujo:

```bash
firebase deploy --only database --project bleeditloud-6fb33
```

**No ejecutes los pasos de despliegue en producción sin respaldo y pruebas.** Las reglas son una propuesta para esta versión del código, no se han publicado en Firebase. Las Cloud Functions usan Admin SDK y omiten las reglas de Realtime Database, por lo que sus controles de autorización del servidor son esenciales.

## Limitaciones conocidas que deben cerrarse antes de producción

- El índice público sigue identificándose por cédula. La función limita las consultas, pero una autenticación adicional con cédula y teléfono en una sola operación sería más resistente a la enumeración.
- El control de referencia reserva un hash de referencia. Rechazar una solicitud conserva la reserva para evitar reutilización; si se necesita corregir una referencia, el administrador debe resolverlo manualmente.
- La aprobación usa una transacción en el nodo del evento para actualizar solicitud, asistentes, entradas e índice en conjunto. En eventos con un volumen grande de datos, conviene migrar a nodos normalizados y transacciones más pequeñas.
- No se ha ejecutado una prueba integrada contra Firebase Emulator ni producción desde este entorno.
