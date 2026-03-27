# Developing Liferay Theme

Esta skill te convierte en un experto en el desarrollo y mantenimiento del tema Liferay de tu proyecto.
Úsala para tareas visuales globales, cambios en `portal_normal.ftl`, ajustes de SCSS, integración de librerías JS globales o modificaciones en `_clay_variables.scss`.

## 📍 Mapa del Territorio (`liferay/themes/<tu-tema>/src`)

- **SCSS Entrypoints**:
  - `css/_custom.scss`: Importador principal de estilos propios. **NO escribir CSS directo aquí**, solo `@import`.
  - `css/_clay_variables.scss`: Variables de Bootstrap/Clay (colores, fuentes, grid). Modificar aquí para cambios globales de diseño.
- **Estructura SCSS (`css/`)**:
  - `ADTs/`: Estilos específicos para Application Display Templates.
  - `fragments/`: Estilos de soporte para fragmentos (aunque los fragments deben ser autocontenidos, a veces requieren helpers globales).
  - `layouts/`: Estilos de layouts de página (grid, contenedores).
  - `templates/`: Estilos para `portal_normal.ftl`, `navigation.ftl`, etc.
  - `widgets/`: Overrides de portlets específicos de Liferay.
- **Templates Freemarker (`templates/`)**:
  - `portal_normal.ftl`: Estructura HTML base (head, body, wrapper).
  - `navigation.ftl`: Menú de navegación principal.
  - `init_custom.ftl`: Variables FTL globales y lógica de configuración del tema.
- **JavaScript (`js/`)**: Scripts globales del tema (`main.js`).

## 🛠️ Flujo de Trabajo (Development Cycle)

El desarrollo de temas en Liferay requiere compilación (Sass -> CSS) y despliegue.

1.  **Modificar**: Realiza los cambios en los ficheros fuente `src/`.
2.  **Construir y Desplegar**:
    ```bash
    task deploy:theme
    ```
    *Este comando ejecuta `gulp build` y copia el `.war` al deploy folder del entorno local activo.*
3.  **Verificar**: Recarga la página en el navegador (limpiando caché si es necesario).

## 🎨 Guía de Estilo SCSS

- **Nesting**: Máximo 3 niveles de profundidad.
- **Variables**: Usa siempre variables de `_clay_variables.scss` (`$primary`, `$gray-900`, `$spacer`) en lugar de valores hardcodeados.
- **Módulos**: Si añades una nueva funcionalidad visual grande, crea un nuevo parcial en la carpeta correspondiente (ej: `css/widgets/_my-widget.scss`) e impórtalo en `css/_custom.scss`.
- **Responsive**: Usa mixins de Bootstrap (`@include media-breakpoint-down(md)`) en lugar de `@media` raw.

## ⚠️ Pitfalls Comunes

- **Cache del Navegador**: Los cambios de CSS a veces son cacheados agresivamente. Usa "Empty Cache and Hard Reload" en DevTools.
- **Orden de Importación**: En `_custom.scss`, el orden importa. Las variables deben ir antes que los componentes que las usan.
- **Errores de Compilación Sass**: `task deploy:theme` fallará si hay errores de sintaxis SCSS. Revisa siempre la salida del comando.
- **No editar `build/`**: Nunca edites ficheros en la carpeta `build/` o `dist/`. Se sobrescriben en cada despliegue.

## 🔍 Diagnóstico

Si los estilos no se aplican:
1. Verifica que el build fue exitoso (`task deploy:theme`).
2. Verifica que el tema está aplicado en la página/site.
3. Inspecciona el elemento y busca si otra regla CSS (con mayor especificidad) está sobrescribiendo tu cambio.
4. Revisa `portal-ext.properties` o `docker-compose` para asegurar que el modo desarrollador está activo (sin minificación agresiva).
