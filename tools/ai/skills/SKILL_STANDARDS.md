# Skill Standards (OpenAI + Anthropic baseline)

Guia corta para mantener skills de alta calidad, basada en patrones de:
- `openai/skills` (curated + system)
- `anthropics/skills` (examples + template)
- especificacion Agent Skills (`agentskills.io`)

## Reglas minimas

1. `SKILL.md` con frontmatter valido:
   - `name`: kebab-case y coincide con la carpeta.
   - `description`: debe explicar claramente **cuando se activa**.
2. `agents/openai.yaml` presente con:
   - `interface.display_name`
   - `interface.short_description`
   - `interface.default_prompt`
3. Estructura orientada a reutilizacion:
   - flujo operativo (pasos)
   - criterios de salida/verificacion
   - troubleshooting cuando aplique

## Buenas practicas de diseno

1. Progressive disclosure:
   - Mantener `SKILL.md` lo mas corto posible.
   - Mover detalle y variantes a `references/`.
   - Usar `scripts/` para pasos deterministas y repetitivos.
2. Trigger preciso:
   - Evitar descripciones genericas.
   - Incluir verbos de activacion concretos (`Use when...` / `Usar cuando...`).
3. Contrato de salida:
   - Definir que debe entregar el agente (artefactos, checks, formato).
4. Sin duplicidad:
   - No repetir el mismo contenido en `SKILL.md` y `references/`.
5. Contexto eficiente:
   - Si el skill crece, priorizar resumen + enlaces internos a referencias.

## Comando de control de calidad

```bash
agents/validate-all.sh
```

Valida naming, frontmatter, metadata de UI y detecta skills sobredimensionados.
