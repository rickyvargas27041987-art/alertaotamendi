# Alertas Preventivas V6

1. Ejecutar una sola vez `SUPABASE_ALERTAS_PREVENTIVAS_V6.sql` en Supabase SQL Editor.
2. Subir todo el proyecto a GitHub y esperar Vercel verde.
3. Persona sospechosa y Vehículo sospechoso ya no envían push ni aviso individual.
4. Con 3 reportes distintos coincidentes en 30 minutos se crea una alerta preventiva.
5. El Centro de Monitoreo muestra un único aviso, un marcador ⚠️ y un perímetro dinámico.
6. Reportes posteriores se agregan al mismo grupo sin repetir el beep/push.
