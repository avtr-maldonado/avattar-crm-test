# Memoria del código: el grafo

[`codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp) indexa
el repositorio con tree-sitter en un grafo de funciones, llamadas e imports, y lo
expone como servidor MCP. Sirve para preguntar «qué toca esta pantalla» o «quién
llama a esto» sin releer archivos, y para guardar un ADR que sobreviva entre
sesiones.

Está registrado en `.mcp.json` como `codebase-memory`. En este repo: 2 944 nodos
y 9 542 aristas, indexado en 15 s. Los archivos con parseo parcial son las
migraciones SQL archivadas y una línea de `lib/domain/folio.ts`; el TypeScript
se indexa completo.

## Instalar (una vez por máquina)

Versión `v0.10.8`, binario `codebase-memory-mcp-windows-amd64.zip` de la página
de *releases*. **Verificar el SHA256 contra `checksums.txt` antes de extraer**:
el instalador oficial no lo hace.

```powershell
$v = "v0.10.8"; $b = "https://github.com/DeusData/codebase-memory-mcp/releases/download/$v"
$d = "$env:LOCALAPPDATA\codebase-memory-mcp"; $t = "$env:TEMP\cbm"; mkdir $t -Force | Out-Null
irm "$b/codebase-memory-mcp-windows-amd64.zip" -OutFile "$t\cbm.zip"
irm "$b/checksums.txt" -OutFile "$t\checksums.txt"
$esperado = (Select-String "$t\checksums.txt" -Pattern "windows-amd64\.zip$").Line.Split(" ")[0]
$real = (Get-FileHash "$t\cbm.zip" -Algorithm SHA256).Hash.ToLower()
if ($esperado -ne $real) { throw "SHA256 no coincide" }
Expand-Archive "$t\cbm.zip" $d -Force
& "$d\codebase-memory-mcp.exe" --version
```

`.mcp.json` lo referencia como `${LOCALAPPDATA}/codebase-memory-mcp/codebase-memory-mcp.exe`.
Quien no lo tenga instalado verá un aviso de servidor MCP caído al arrancar
Claude Code; es inofensivo.

La base queda en `%USERPROFILE%\.cache\codebase-memory-mcp\`, **fuera de
OneDrive**. Si estuviera dentro pagaría la misma penalización de E/S que se
describe en `latencia-dev.md`.

## Mantenerlo al día

El índice es incremental: `index_repository` vuelve a leer solo lo que cambió.

- Al empezar una sesión de trabajo, o tras un cambio grande, reindexar. Como
  herramienta MCP: `index_repository` con `repo_path` del repo. Desde la
  terminal, sin Claude:

  ```powershell
  & "$env:LOCALAPPDATA\codebase-memory-mcp\codebase-memory-mcp.exe" cli index_repository --repo-path "<ruta del repo>"
  ```

- Con el servidor MCP corriendo, `auto_watch` (activo por omisión) detecta
  cambios por git y reindexa solo.
- El **ADR del proyecto** vive dentro del grafo (`manage_adr`). Cuando cambie
  una decisión de arquitectura —una capa nueva, un invariante, un supuesto de
  `decisiones-pendientes.md`— actualizarlo ahí también, para que la siguiente
  sesión lo encuentre sin leer los documentos.

## Recetas que sí funcionan

El nombre del proyecto en el grafo es la ruta con guiones:
`C-Users-MiguelMaldonado-OneDrive-AVATTAR-Escritorio-avattar-crm`. Las opciones
de dirección son `inbound` (quién me llama), `outbound` (a quién llamo) y
`both`; `callers`/`callees` no existen.

| Pregunta | Herramienta |
|---|---|
| ¿Qué lecturas dispara esta pantalla? | `trace_path --function-name DetalleOportunidadPage --direction outbound --depth 2` |
| ¿Quién llama a `requireSession`? | `trace_path --function-name requireSession --direction inbound` |
| ¿Dónde se llama a `auth.getUser`? | `search_code --pattern "auth.getUser" --path-filter "\.(ts\|tsx)$"` |
| Cuántos lectores de `lib/scope` alcanza cada página | `query_graph` con Cypher: `MATCH (p:Function)-[:CALLS*1..3]->(f:Function) WHERE p.file_path ENDS WITH 'page.tsx' AND f.file_path STARTS WITH 'lib/scope' RETURN p.file_path, count(DISTINCT f.name)` |
| Vista general: paquetes, entradas, puntos calientes | `get_architecture` (agregar `aspects: ["hotspots"]`, `["layers"]`…) |
| Qué cambió desde el último índice | `detect_changes` |

Desde la terminal, todas se invocan como
`codebase-memory-mcp.exe cli <herramienta> --flag valor`. El binario imprime
sus trazas de arranque por `stderr` (`level=info …`); filtrarlas con
`2>&1 | grep -v "^level=\|^hint:"`.

Una limitación observada: las aristas `CALLS` no conservan el texto del
*callee* para llamadas a miembros externos (`prisma.x.y`, `supabase.auth.z`),
así que «cuántas consultas a Prisma hace X» se responde mejor con `search_code`
o `grep` que con Cypher.
