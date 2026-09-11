# Alerta Otamendi v7

Cambios incluidos:

- Botón pequeño 👮 junto al botón de farmacias en la app pública.
- Busca comisarías/dependencias policiales cercanas usando la ubicación del teléfono y datos públicos de OpenStreetMap/Overpass.
- Muestra distancia aproximada, dirección, teléfono si está disponible y botón "Cómo llegar".
- Los reportes individuales de "Persona sospechosa" y "Vehículo sospechoso" ya no se muestran como marcadores en el mapa público.
- Esos reportes siguen visibles en el Centro de Monitoreo.
- La app pública muestra la alerta preventiva agrupada cuando existen 3 o más reportes coincidentes, con marcador y perímetro aproximado.
- El chequeo local de alertas cercanas también ignora los reportes individuales de Persona/Vehículo sospechoso para evitar avisos aislados.

No requiere cambios en Supabase.
