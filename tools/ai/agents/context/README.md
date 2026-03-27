# LLM Context (repomix)

Contexto optimizado para agentes LLM externos (ChatGPT, Codex, Gemini, etc.) usando `repomix`.

## Estructura

- `manifests/core.lst`: lista de ficheros fuente (versionada en Git).
- `generated/core.txt`: contexto resultante (~3K lineas, cabe en cualquier LLM). No versionado.
- `validate-all.sh`: script para generar el contexto.
