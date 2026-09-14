# Centro de Monitoreo V8

Esta versión agrega mejoras operativas y estadísticas sin reemplazar las funciones existentes.

## Mejoras incluidas

- Panel de situación actual y prioridades.
- Prioridad automática por IA y alertas relacionadas.
- Modo emergencia para concentrarse en alertas críticas y altas.
- Asignación de una alerta a un operador mediante **Tomar alerta**.
- Identificación del operador responsable en las listas y el detalle.
- Línea de tiempo de cada incidente, alimentada por la auditoría existente.
- Antigüedad visual: los reportes nuevos y críticos se destacan; los finalizados o antiguos pierden intensidad.
- Gráficos de los últimos siete días, categorías, prioridades, estados, localidades y horarios.
- Indicadores de resolución y tiempo promedio de primera respuesta.
- Filtros por fechas, estado, categoría y prioridad aplicados también a las estadísticas.
- Protección por jurisdicción: los operadores solamente reciben reportes de sus zonas; el administrador conserva la visión nacional.
- Registro de asignaciones, liberaciones, revisiones y cambios de estado.

## Paso obligatorio antes de publicar

1. Abrir **Supabase**.
2. Entrar en **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar y ejecutar todo el contenido de `SUPABASE_CENTRO_OPERATIVO_V8.sql`.
5. Cuando Supabase indique que terminó correctamente, subir el resto de los archivos a GitHub.
6. Esperar que Vercel finalice en verde.

El script utiliza `IF NOT EXISTS`, por lo que evita recrear columnas e índices que ya estén presentes.

## Comprobaciones recomendadas

1. Ingresar al Centro con un operador real.
2. Abrir una alerta y pulsar **Tomar alerta**.
3. Confirmar que aparezca el nombre del responsable.
4. Cambiar el estado y comprobar la línea de tiempo.
5. Abrir **Historial y estadísticas**, elegir **Estadísticas** y probar los filtros.
6. Activar y desactivar **Modo emergencia**.
7. Entrar con un operador limitado y comprobar que solamente vea sus jurisdicciones.

La compilación de producción y la comprobación completa de TypeScript fueron ejecutadas correctamente en esta entrega.
