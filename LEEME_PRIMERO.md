# Alerta Otamendi — versión mejorada

## Centro de monitoreo
- Encabezado primero, con reloj en vivo, sincronización manual y estado del sistema.
- Mapa operativo como elemento central de la primera pantalla.
- Prioridades a la izquierda y cola de atención inmediata a la derecha.
- Marcadores mejorados, pulso para alertas recientes, colores por categoría y botón útil para centrar alertas.
- Detalle de alerta sin mapa embebido; la ubicación se consulta en el mapa principal.
- Botón final “Volver al mapa principal”.
- Búsqueda y filtros por estado/categoría, acciones rápidas y paginación progresiva.

## Aplicación vecinal
- Flujo móvil más simple: elegir situación → describir → enviar.
- Ubicación obligatoria para reportar.
- Evidencia opcional con límites de tamaño y nombres aleatorios criptográficamente fuertes.
- Avisos cercanos dentro de 10 km.
- Alertas normales: aviso breve dentro de la app, una sola vez.
- Alertas importantes (robo, emergencia, accidente e incendio): push cuando la app está cerrada + aviso/sonido/vibración cuando está abierta, según soporte del dispositivo.
- Campanita existente reutilizada para activar/desactivar alertas cercanas.
- Mapa comunitario con ubicación aproximada y sin descripción/evidencia sensible.
- “Mis reportes” consulta un endpoint específico y no descarga toda la base.

## Seguridad
- GET público de /api/reports no devuelve descripción, foto, video ni audio.
- Coordenadas públicas redondeadas (~100 m) para evitar señalar una ubicación exacta.
- PATCH de estados sigue siendo exclusivo del administrador.
- PushSubscription permanece del lado del servidor.
- Ejecutar SUPABASE_SEGURIDAD.sql para bloquear acceso directo/Realtime público a Report.

## Importante sobre multimedia
El código deja de exponer las URLs multimedia en las APIs públicas y ahora usa nombres aleatorios. Sin embargo, el frontend actual sigue usando `getPublicUrl()` de Supabase Storage. Si el bucket `alertas` está configurado como público, una URL conocida continúa siendo accesible. Para privacidad criptográfica completa, el siguiente endurecimiento sería convertir ese bucket a privado y servir evidencia al administrador mediante URLs firmadas temporales usando una credencial de servidor.

## Variables VAPID requeridas en Vercel
- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT

No guardar estas claves en GitHub.
