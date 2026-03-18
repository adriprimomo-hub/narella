# Sistema - Funcionalidades y Actores

## Resumen
Sistema web SaaS para gestion de turnos, clientes, servicios, caja, facturacion y comunicacion por WhatsApp en centros de servicios (ej. estetica/salon).

Funciona con arquitectura multi-tenant: cada negocio opera con sus propios datos aislados.

## Actores del sistema
- `admin`: acceso total, configuracion y control operativo/financiero.
- `recepcion`: operacion diaria de turnos, clientes, servicios, cobros y facturacion.
- `caja`: operacion de caja y modulos operativos sin configuracion avanzada.
- `staff`: ejecucion de trabajo desde un panel especializado con agenda del dia y edicion limitada a turnos en curso.
- `solo_turnos`: acceso reducido a agenda de turnos.

## Modulos principales
### 1) Turnos
- Alta, edicion y gestion de turnos.
- Inicio/cierre de turno.
- Turnos simultaneos con identificacion visual y acciones agrupadas.
- Registro de hora de inicio en turnos en curso.
- Envio de confirmaciones por WhatsApp.

### 2) Clientes
- Alta y actualizacion de ficha de cliente.
- Historial por cliente.
- Vinculacion de turnos, pagos, facturas y declaraciones juradas.

### 3) Servicios
- ABM de servicios.
- Configuracion de precio/duracion.
- Asociacion opcional de Declaracion Jurada (DJ) por servicio.

### 4) Declaraciones Juradas (DJ)
- Plantillas configurables desde Configuracion (texto y campos).
- Seleccion por servicio (o sin DJ).
- Generacion de link al iniciar turno cuando aplica.
- Envio sugerido por modal con acceso directo a `wa.me`.
- Respuesta de cliente con firma.
- Almacenamiento de DJ completada como PDF y visualizacion desde historial/cobro.
- Estado visible en cierre/cobro: enviada o no, completada o no.

### 5) Caja y cobros
- Registro de pagos por turno y por grupo.
- Cierre y cobro con controles de estado (incluye DJ cuando corresponde).
- Registro de movimientos de caja.

### 6) Facturacion
- Emision de comprobantes.
- Reintentos automaticos cuando un comprobante queda pendiente.
- Gestion de errores operativos y registro de resultados.

### 7) Giftcards
- Emision, seguimiento y consumo de giftcards.
- Personalizacion de plantilla/mensaje de envio.

### 8) Inventario y productos
- Gestion de insumos y movimientos.
- Gestion de productos, stock y ventas asociadas a turnos.

### 9) Personal y liquidaciones
- ABM de empleadas.
- Ausencias.
- Liquidaciones e historial.

### 10) Configuracion
- Parametros generales del tenant.
- Personalizacion de mensajes (confirmaciones, facturas/giftcards, liquidaciones, vencidos y DJ).
- Placeholder helper en UI para cada tipo de mensaje.
- Gestion de usuarios internos y permisos (admin).

## Mensajeria y comunicacion
- Envio por WhatsApp de:
  - Confirmaciones de turno.
  - Facturas/giftcards.
  - Liquidaciones.
  - Recordatorios de servicios vencidos.
  - Declaraciones juradas.
- Textos configurables por tenant desde Configuracion (sin hardcode operativo en variables de entorno para contenido de mensaje).

## Multi-tenant y seguridad
- Los datos de negocio se filtran por `usuario_id` (tenant owner) en tablas y APIs.
- Roles validan autorizacion por endpoint y por UI.
- RLS habilitado en tablas publicas criticas.
- Vistas publicas hardenizadas con `security_invoker`.
- Roles no autorizados (ej. recepcion/staff para config sensible) quedan bloqueados.

## Flujos de negocio destacados
### Flujo de turno con DJ
1. Se agenda turno con servicio que tiene DJ asociada.
2. Al iniciar turno, se genera link de DJ y se muestra modal de envio.
3. Se envia a la clienta por WhatsApp.
4. Clienta completa y firma.
5. Se guarda respuesta y PDF.
6. En cierre/cobro se ve estado y se puede reenviar/ver PDF.

### Flujo de facturacion
1. Se cierra/cobra turno o venta.
2. Se emite comprobante.
3. Si falla temporalmente, queda pendiente y reintenta automatico.
4. Se registra resultado para auditoria.

## Integraciones y despliegue
- Frontend/backend en Next.js (Vercel).
- Base de datos en Supabase.
- Migraciones versionadas en `supabase/migrations`.
- Integraciones de mensajes y facturacion segun configuracion del tenant.

## Limites conocidos / puntos de control
- Dependencia de conectividad para envios externos.
- Facturacion depende de configuracion fiscal correcta del tenant.
- Operacion multi-rol requiere mantener alta calidad en permisos para evitar accesos cruzados.
