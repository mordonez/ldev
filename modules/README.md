# liferay-cli-bootstrap

Módulo OSGi que crea o actualiza automáticamente una aplicación OAuth2 técnica al arrancar Liferay usando `OAuth2ApplicationLocalService`. Su objetivo es garantizar que herramientas como `liferay-cli` tengan acceso sin intervención manual.

## Funcionamiento

1. Al arrancar el portal, el módulo busca una aplicación con `externalReferenceCode=liferay-cli`.
2. Si no existe, la crea con un `clientId` y `clientSecret` **generados aleatoriamente** (o definidos por configuración).
3. Si ya existe, se asegura de que el nombre y los scopes sean correctos.
4. Por seguridad, **nunca sobreescribe el secreto** de una aplicación existente a menos que se fuerce via configuración (`rotateClientSecret=true`).

## Configuración

Se puede configurar vía variables de entorno o mediante un fichero OSGi `.config` (`dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration.config`).

Variables de entorno soportadas (tienen prioridad sobre el `.config`):

- `LIFERAY_CLI_OAUTH2_ENABLED=true`
- `LIFERAY_CLI_OAUTH2_COMPANY_WEB_ID=liferay.com`
- `LIFERAY_CLI_OAUTH2_ADMIN_EMAIL=test@liferay.com`
- `LIFERAY_CLI_OAUTH2_CLIENT_ID` (opcional, si no se indica se genera aleatorio)
- `LIFERAY_CLI_OAUTH2_CLIENT_SECRET` (opcional, si no se indica se genera aleatorio)

## Cómo obtener las credenciales

En el entorno de desarrollo, puedes recuperar las credenciales generadas en tu instancia local ejecutando:

```bash
ldev osgi liferaycli-creds
```

## Prueba rápida

1. Compilar y desplegar:
   - `cd liferay`
   - `./gradlew :modules:liferay-cli-bootstrap:deploy`
2. Reiniciar Liferay o redeploy del bundle.
3. Verificar en logs que aparece: `OAuth2 app 'liferay-cli' created (clientId=...)`.

## Test del módulo

```bash
cd liferay
./gradlew :modules:liferay-cli-bootstrap:test
```
