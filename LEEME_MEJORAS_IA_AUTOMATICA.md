# Mejoras Centro de Monitoreo

Cambios incluidos:
- Análisis IA automático al crear cada reporte nuevo.
- El detalle abre mostrando el análisis ya guardado (sin exigir botón manual).
- Botón manual queda como reintento/reanálisis.
- Dirección legible en el detalle mediante geocodificación inversa; las coordenadas siguen internas para el mapa.
- Prioridad operativa IA visible en la lista.
- Alarmas escaladas: baja sin sonido, media un tono, alta tres tonos, crítica alarma reforzada y visual pulsante.
- Si la IA falla, el reporte NO se pierde: continúa guardado y puede reanalizarse manualmente.

No requiere cambios de Prisma/Supabase para estas mejoras.
Requiere conservar en Vercel OPENAI_API_KEY y ADMIN_SESSION_SECRET.
