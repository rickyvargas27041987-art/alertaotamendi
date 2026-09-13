# Suscripciones del Centro de Monitoreo + Mercado Pago

Esta versión agrega control comercial de acceso a los usuarios del Centro de Monitoreo.

## Planes
- COURTESY: acceso sin vencimiento (manual).
- TRIAL: prueba de 15 días.
- MONTHLY: mensual.
- ANNUAL: anual.

Los usuarios ADMIN quedan exceptuados del bloqueo por suscripción para evitar perder el acceso administrativo.
La propiedad `active` sigue siendo independiente: permite suspender una cuenta manualmente aunque la suscripción esté paga.

## 1. Ejecutar SQL en Supabase
Ejecutar una sola vez el archivo:

`SUPABASE_SUSCRIPCIONES_CENTRO_MONITOREO.sql`

Los usuarios existentes quedan automáticamente como COURTESY / ACTIVE, por lo que nadie queda bloqueado al aplicar la migración.

## 2. Variables en Vercel
No subir secretos a GitHub. Agregar en Vercel > Settings > Environment Variables:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_PLAN_MONTHLY_ID`
- `MERCADOPAGO_PLAN_ANNUAL_ID`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL=https://alertaotamendi.vercel.app`

## 3. Planes de Mercado Pago
Crear dos planes de suscripción en Mercado Pago:
- Centro de Monitoreo Mensual
- Centro de Monitoreo Anual

Guardar cada `preapproval_plan_id` en las variables de Vercel correspondientes.

## 4. Webhook
Configurar la URL pública:

`https://alertaotamendi.vercel.app/api/mercadopago/webhook`

Para Suscripciones, habilitar al menos:
- `subscription_preapproval`
- `payment`

Guardar la clave secreta del webhook en `MERCADOPAGO_WEBHOOK_SECRET`.

## 5. Flujo
1. El administrador crea un usuario y asigna su jurisdicción.
2. Carga el email de facturación.
3. Puede dar Prueba, Cortesía, +30 días o +1 año manualmente.
4. Para cobro recurrente usa `Cobrar mensual` o `Cobrar anual`.
5. El backend crea la suscripción en Mercado Pago y abre el checkout.
6. Los webhooks actualizan el estado del usuario.
7. Si la suscripción deja de estar activa, el usuario no puede entrar y las sesiones se cierran.
8. No se borran usuario, zonas, historial ni auditoría.

## Estados
- ACTIVE: acceso habilitado.
- PENDING: esperando pago/autorización.
- PAST_DUE: pago rechazado o pendiente de regularización.
- SUSPENDED: suspendida manualmente o en Mercado Pago.
- CANCELED: cancelada.

## Seguridad
- El Access Token de Mercado Pago sólo se usa en el servidor.
- El webhook valida HMAC-SHA256 cuando `MERCADOPAGO_WEBHOOK_SECRET` está configurado.
- No guardar tokens o secretos en Prisma ni en archivos públicos.
