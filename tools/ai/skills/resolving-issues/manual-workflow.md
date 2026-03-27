# Flujo manual de resolucion de issues

Guia paso a paso para resolver issues sin el pipeline automatizado.

## 1. Preparar worktree aislado

```bash
task worktree:new -- issue-NUM
cd .worktrees/issue-NUM
```

El worktree genera un `.env` aislado con puertos unicos y reutiliza cache de
build cuando ya existe para el commit actual.

Si `issue-NUM` es sub-issue (`Parent: #PARENT_NUM`), confirmar antes de crear
la PR que la rama base `fix/issue-PARENT_NUM` existe en remoto.

Overrides opcionales:
- `PARENT_ISSUE_NUM=<NUM>` fuerza el parent sin consultar GitHub.
- `AUTO_PARENT_BRANCH_BOOTSTRAP=0` desactiva la deteccion automatica del parent.

> **Nunca** aplicar fixes de issues en el workspace compartido `main`.

## 2. Resolver host y puerto runtime desde `.env`

```bash
cd docker
HTTP_PORT=$(grep LIFERAY_HTTP_PORT .env 2>/dev/null | cut -d= -f2 || echo 8080)
HTTP_HOST=$(grep BIND_IP .env 2>/dev/null | cut -d= -f2 || echo localhost)
echo "URL runtime: http://${HTTP_HOST}:${HTTP_PORT}"
```

## 3. Analizar la issue

- Leer la issue completa
- Identificar modulo(s) afectado(s) desde la tabla de modulos en `CLAUDE.md`
- Para issues CSS/visuales: descargar screenshots con `gh api` e inspeccionar visualmente

## 4. Localizar el codigo

```bash
rg -n "ClassName" liferay/modules -g "*.java"
rg -n "es\\.ricoh\\.ub\\.NAME" liferay/modules -g "bnd.bnd"
```

## 5. Aplicar el fix

- Si se modifica `service.xml`: ejecutar `buildService` primero
- Si se modifica `.config`: aplicar y reiniciar si hace falta

## 6. Compilar y desplegar

```bash
task deploy:module -- MODULE-NAME
```

## 7. Verificar

- Bundle ACTIVO: `task osgi:status -- es.ricoh.ub.NAME`
- Reproducir el escenario de la issue en `http://${HTTP_HOST}:${HTTP_PORT}`

## 8. Revisar logs

```bash
cd docker
docker compose logs liferay 2>&1 | grep -E "ERROR|Exception" | grep -v "expected\|intentional"
```

## 9. Commit

```bash
git add liferay/modules/MODULE-NAME/
git commit -m "fix: descripcion breve en espanol

- Detalle del cambio
Closes #ISSUE_NUMBER"
```

## 10. Crear PR con base correcta

Regla:
- Issue principal: `--base main`
- Sub-issue con `Parent: #PARENT_NUM`: `--base fix/issue-PARENT_NUM`

```bash
ISSUE_NUM=ISSUE_NUMBER
PARENT_ISSUE_NUM="$(gh issue view "$ISSUE_NUM" --json body --jq '.body' | sed -nE 's/.*Parent:[[:space:]]*#([0-9]+).*/\1/p' | head -1)"

if [ -n "${PR_BASE_BRANCH:-}" ]; then
  PR_BASE="$PR_BASE_BRANCH"
elif [ -n "$PARENT_ISSUE_NUM" ]; then
  PR_BASE="fix/issue-${PARENT_ISSUE_NUM}"
else
  PR_BASE="main"
fi

git ls-remote --exit-code --heads origin "$PR_BASE" >/dev/null

gh pr create \
  --title "fix(modulo): descripcion breve (#${ISSUE_NUM})" \
  --base "$PR_BASE" \
  --body-file "/tmp/pr_body_issue_${ISSUE_NUM}.md"
```

Plantilla recomendada para `/tmp/pr_body_issue_${ISSUE_NUM}.md`:

```md
## Problema
...

## Causa raíz
...

## Solución
...

Closes #ISSUE_NUMBER

## Verification
1. Ejecutar build/test relevante del cambio.
2. Reproducir el escenario funcional de la issue.
3. Verificar logs sin errores nuevos relevantes.
```

Regla: `## Verification` debe ser la última sección del PR y contener pasos reproducibles.

## 11. Comentar la issue

```bash
PR_URL=$(gh pr list --head "$(git branch --show-current)" --json url --jq '.[0].url')
gh issue comment "$ISSUE_NUM" --body "✅ PR creado: $PR_URL"
```
