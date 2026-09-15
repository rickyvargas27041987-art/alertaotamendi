# Acceso operativo seguro

Esta versión agrega una herramienta móvil restringida para Policía, Bomberos,
Emergencias médicas y Defensa Civil.

## Antes de publicar

1. Entrar en Supabase.
2. Abrir **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar y ejecutar todo el contenido de `SUPABASE_ACCESO_OPERATIVO.sql`.
5. Confirmar que la consulta finalice correctamente.
6. Subir después el código completo a GitHub y esperar que Vercel quede en verde.

No es necesario agregar una variable nueva en Vercel: el código utiliza
`ADMIN_SESSION_SECRET`, que ya existe. Opcionalmente puede configurarse una
variable independiente llamada `OPERATIONAL_CODE_SECRET` con una cadena larga y
aleatoria.

## Funcionamiento

- En el Centro de Monitoreo aparece **🛡️ Acceso operativo**.
- El código tiene 6 dígitos y cambia automáticamente cada 12 horas.
- **Cambiar código ahora** invalida el código anterior y revoca todos los
  teléfonos que lo estaban utilizando.
- El Centro puede ver y revocar individualmente cada acceso activo.
- La app pública muestra un escudo pequeño junto a **Mis reportes**.
- El personal autorizado ingresa código, nombre, institución y servicio.
- Solo ve alertas activas de la jurisdicción y de las categorías adecuadas a su
  función.
- Puede abrir ubicación exacta, foto, video o audio, e iniciar navegación con
  Google Maps o Waze.
- No se muestra la identidad del vecino que realizó el reporte.
- Los ingresos, consultas, reportes abiertos y navegaciones quedan registrados
  en la auditoría.

## Seguridad incorporada

- El código no se guarda en texto plano.
- La sesión utiliza una cookie segura y no accesible desde JavaScript.
- Cinco intentos incorrectos bloquean temporalmente nuevos intentos durante 15
  minutos desde esa conexión.
- Cada sesión vence junto con el código.
- Un código perteneciente a un Centro nunca concede acceso a otra jurisdicción.
