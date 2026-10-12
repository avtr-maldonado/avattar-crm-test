-- El bucket de documentos, como parte del esquema y no como un clic.
--
-- Hasta el 12 de octubre de 2026 el bucket `documentos` existia en desarrollo
-- solo porque alguien lo creo a mano en la consola. Un ambiente nuevo nacia sin
-- el, y la pestana Documentos fallaba al primer intento de subir algo sin que
-- nada en el repo avisara (plan de ambiente productivo, D4).
--
-- Privado: la descarga se hace con URL firmada de vida corta, emitida en el
-- servidor solo para quien alcanza la oportunidad (F-19). Con el bucket en
-- publico esa firma no protege nada, porque la ruta directa tambien responde;
-- fue el riesgo abierto `Q-17` hasta que se apago en desarrollo.
--
-- Sin limite de tamano ni lista de tipos, igual que desarrollo: el formulario
-- acepta propuestas, contratos y ordenes de compra en los formatos que use el
-- cliente, y una lista blanca mal puesta se descubre cuando alguien no puede
-- subir el contrato que cierra el trato. Ponerles tope es una decision de
-- operacion, se toma en la consola y no necesita codigo.
--
-- La politica de acceso vive fuera: `storage.objects` no lleva ninguna, porque
-- el CRM entra con `service_role` desde el servidor (`lib/supabase/admin.ts`) y
-- la autorizacion la decide `lib/scope` antes (INV-01).

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;
