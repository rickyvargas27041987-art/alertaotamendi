# Estadísticas de usuarios de la app

Esta versión agrega al Centro de Monitoreo Admin:

- Usuarios nuevos hoy.
- Usuarios nuevos durante la semana actual (desde el lunes).
- Usuarios agrupados por localidad y partido/departamento.

La información solo aparece para el rol `ADMIN`. La API también verifica el rol,
por lo que operadores e instituciones no pueden obtener estos datos ingresando la
dirección de la API manualmente.

## Paso obligatorio antes de publicar

1. Abrir Supabase.
2. Entrar en **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar todo el contenido de `SUPABASE_ESTADISTICAS_USUARIOS.sql`.
5. Presionar **Run**.
6. Recién después, subir el proyecto actualizado a GitHub.

## Importante

El conteo es anónimo: no guarda nombre, teléfono ni contraseña del vecino. Cada
instalación recibe un identificador técnico aleatorio.

Las estadísticas empiezan a registrar instalaciones desde que se publica esta
versión. Los usuarios existentes se incorporan automáticamente cuando vuelven a
abrir la app. La ubicación se completa usando la localidad elegida al instalar o,
si corresponde, la ubicación que el usuario ya autorizó para las alertas cercanas.
