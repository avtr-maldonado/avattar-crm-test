-- §60 · Transcripción opcional en llamadas y videollamadas. El tipo dice si la
-- admite (dato del catálogo, como is_contract en document_types); la actividad
-- la guarda tal cual para que un MCP la lea después.
ALTER TABLE "activity_types" ADD COLUMN "has_transcript" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "transcript" TEXT;

UPDATE "activity_types" SET "has_transcript" = true WHERE "name" IN ('Llamada', 'Videollamada');
