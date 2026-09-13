# Mejoras Centro de Monitoreo

Esta versión incorpora:

- Botón **Ver detalle** con ciclo de 3 vistas sobre la localidad seleccionada: vista normal -> calles -> detalle cercano -> vista normal.
- Eliminación del botón viejo **Ver alertas**.
- Nuevo botón **Historial** junto al mapa.
- Historial con búsqueda por número, texto/localidad, estado, categoría, prioridad y rango de fechas.
- Panel de estadísticas por categoría, prioridad, estado, localidad y franja horaria de mayor actividad.
- Vista **Zonas calientes** con mapa de concentración aproximada por sectores de ~1 km y ranking de sectores.
- Terminología visible **Hurto / Robo** manteniendo el valor interno histórico `Delito / Robo` para no romper base de datos ni APIs.
- Guía para IA: distinguir orientativamente posible hurto de posible robo según los hechos, sin afirmar una calificación jurídica definitiva.

No requiere cambios de esquema ni SQL nuevo.
