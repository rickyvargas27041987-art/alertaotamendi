# Usuarios y jurisdicciones - Alerta Otamendi

1. Antes de desplegar, ejecutar `PRISMA_CAMBIOS_USUARIOS.sql` una sola vez en Supabase > SQL Editor.
2. Subir esta versión a GitHub y esperar Vercel en verde.
3. Entrar con el acceso administrador original. En el login se puede escribir `admin` como usuario (o dejarlo vacío) y usar la contraseña administrativa existente.
4. En `/admin` aparece el botón `👥 Usuarios` solamente para administradores.
5. Crear operadores con usuario, contraseña y jurisdicción. Si `Localidad` queda vacía, el operador puede trabajar en todo el partido/distrito asignado.
6. Un operador suspendido pierde sus sesiones activas inmediatamente.
7. Los cambios de estado y el seguimiento de vehículos verifican la jurisdicción en el servidor, no sólo en la interfaz.
8. Los nuevos reportes intentan guardar automáticamente provincia, distrito/municipio y localidad a partir de sus coordenadas mediante GeoRef.
9. Los reportes antiguos quedan sin jurisdicción hasta completar/backfillear esos datos. Por seguridad, un OPERADOR no puede modificar un reporte sin jurisdicción; el ADMIN sí.
10. Auditoría disponible en `/admin/auditoria`.

IMPORTANTE: esta es la primera etapa. La comparación IA global ya puede seguir viendo seguimientos globales, pero las notificaciones/casos interjurisdiccionales dedicados se implementan en la siguiente etapa.
