-- ALTA PRIORIDAD: bloquea el acceso directo del cliente público a la tabla Report.
-- La aplicación pública ahora consulta /api/reports, que devuelve datos sanitizados.
ALTER TABLE public."Report" ENABLE ROW LEVEL SECURITY;

-- Ya no usamos Supabase Realtime directamente desde el navegador para Report.
-- Esto evita que un cliente público reciba el contenido completo de filas nuevas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Report'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public."Report"';
  END IF;
END $$;
