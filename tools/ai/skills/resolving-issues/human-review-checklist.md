# Checklist de revision humana

Checklist para revisar PRs creados por el pipeline automatizado.

## En GitHub

- [ ] Diff del PR: ¿el cambio es minimo y focalizado?
- [ ] Rama base correcta: sub-issue -> `fix/issue-<parent>`, issue principal -> `main`
- [ ] No hay ficheros innecesarios en commit (`.env`, `liferay-theme.json`, `build/`)
- [ ] El mensaje de commit cierra la issue (`Closes #NUM`)
- [ ] El body del PR termina con `## Verification` y pasos claros/reproducibles

## En entorno local

```bash
# URL de login:
#   - Main workspace: http://localhost:8080/c/portal/login
#   - Worktree: http://${BIND_IP:-localhost}:${LIFERAY_HTTP_PORT:-8080}/c/portal/login
# Usuario: admin@liferay.local / test

# 1. Navegar a la URL descrita en la issue
# 2. Reproducir el escenario del bug
# 3. Confirmar que la issue ya no ocurre
# 4. Revisar regresiones en areas relacionadas

task env:logs SINCE=5m
```

## Accion

- Todo correcto -> **Aprobar y mergear** el PR
- Se detectan problemas -> Solicitar cambios (el agente recibira comentarios y aplicara correcciones)
