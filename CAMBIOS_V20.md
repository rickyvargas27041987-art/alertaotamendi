# Alerta Otamendi V20

## Correcciones implementadas

- Guardado inmediato de alertas; IA, jurisdicción y avisos continúan después de responder.
- Segundo intento automático para resolver partido/localidad.
- Bandeja visible para el superadministrador cuando una alerta queda sin jurisdicción.
- Envío real de notificaciones Android por Firebase Cloud Messaging.
- Baja del token Android cuando el usuario desactiva la campanita.
- Avisos preventivos agrupados también dirigidos al acceso operativo policial.
- Comisarías cercanas con tres servidores alternativos y tiempos máximos.
- Separación entre `ADMIN` (superadministrador) y `CENTER_ADMIN`.
- Patrones de personas y seguimientos de vehículos limitados por jurisdicción.
- API pública limitada a alertas activas de las últimas dos horas.
- Intentos de acceso y envíos públicos limitados mediante una tabla compartida.
- Cookie del administrador original firmada y con vencimiento; ya no contiene el secreto.
- Subidas de fotos, videos y audios autorizadas con permisos de un solo uso y límites reales.
- Validación del origen de las direcciones multimedia recibidas por el servidor.
- Política de privacidad ampliada.
- Ruta duplicada y archivo antiguo eliminados.
- Cinco pruebas automáticas y comandos `npm test` / `npm run check`.
- SQL único de actualización que no borra datos existentes.

## Configuración externa necesaria

Consultar `LEEME_ACTUALIZACION_V20.md`. Antes de publicar se debe ejecutar el
SQL y agregar en Vercel las credenciales de Firebase y la clave de servicio de
Supabase.

## Funciones que necesitan acuerdos o fuentes externas

Estas funciones no pueden activarse únicamente con código del proyecto:

- Farmacias oficialmente de turno: hace falta una fuente oficial actualizada de cada municipio.
- Cámaras municipales: hace falta autorización y datos del sistema VMS/RTSP/ONVIF utilizado.
- Alertas SMN automáticas: debe definirse la fuente oficial, frecuencia y reglas de aviso antes de activarlas en producción.

La búsqueda de farmacias cercanas y comisarías continúa funcionando mediante
datos cartográficos, con acceso alternativo a Google Maps desde la interfaz.
