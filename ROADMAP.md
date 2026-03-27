# Roadmap

## Next Productization Step

`ldev` no debe quedarse como una extracción literal de `liferay-dxp-docker-dev`.

Estado actual:

- el repo nuevo ya encapsula la CLI y los assets necesarios para funcionar
- `project init` y `project add` permiten preparar proyectos sin symlink a un vendor repo
- todavía se arrastran directorios grandes heredados como `docker/` y `liferay/`

Dirección objetivo:

- reducir `docker/` y `liferay/` a solo los ficheros realmente necesarios para operar con `ldev`
- evitar el modelo de "copiar y pegar un repo ya preparado"
- hacer que `ldev` construya o añada la estructura mínima requerida en cada proyecto

Requisito funcional que debe cubrir `ldev`:

- un comando oficial para crear o completar el entorno local del proyecto
- debe poder generar o añadir lo que falte para operar bien con `ldev`
- ejemplos de alcance: `docker-compose.yml`, `docker/.env`, scripts de runtime, ficheros OSGi/config de `liferay/`, módulo bootstrap y demás ficheros mínimos necesarios

Implicación para la siguiente fase:

- `project init` y `project add` probablemente deben evolucionar hacia un scaffold más inteligente y más pequeño
- el repo `ldev` debe pasar de almacenar un "snapshot" amplio del entorno a definir un scaffold mínimo y mantenible
