# Actualización integral V20

## Orden obligatorio

1. En Supabase, abrir **SQL Editor**.
2. Copiar y ejecutar todo `SUPABASE_ACTUALIZACION_INTEGRAL_V20.sql`.
3. En Vercel, agregar las variables Firebase indicadas abajo.
4. Recién después subir el proyecto a GitHub.

El SQL no elimina datos y se puede ejecutar más de una vez.

## Variables nuevas de Vercel para notificaciones Android

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `RATE_LIMIT_SECRET` (texto largo aleatorio; recomendado)
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API; nunca subirla a GitHub)

Las tres variables Firebase se obtienen en Firebase Console → Configuración del
proyecto → Cuentas de servicio → Generar nueva clave privada. No se debe subir el
archivo JSON a GitHub. Copiar sus valores únicamente en Vercel. En
`FIREBASE_PRIVATE_KEY`, Vercel puede recibir la clave completa incluyendo las
líneas BEGIN/END.

La clave `SUPABASE_SERVICE_ROLE_KEY` permite generar permisos de subida de un
solo uso. Debe configurarse únicamente en Vercel y nunca llevar el prefijo
`NEXT_PUBLIC_`.

## Cambios principales

- La alerta se confirma inmediatamente y el trabajo de IA/notificaciones continúa después.
- Envío real de notificaciones FCM a la aplicación Android.
- Desactivación del token Android al apagar la campanita.
- Comisarías con servidores alternativos y tiempos máximos.
- Protección compartida contra intentos de acceso y envíos abusivos.
- Administrador global separado de administrador de centro.
- Patrones y seguimientos filtrados por jurisdicción.
- El API público entrega solamente alertas activas de las últimas dos horas.
