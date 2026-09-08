# Santiago Massieri — one-pager

Sitio estático (HTML + CSS + JS, sin build, sin backend, sin base de datos).

```
index.html          contenido de la página, incluido el código Python de los 3 proyectos
css/styles.css      todos los estilos
js/runner.js        motor que ejecuta los scripts de Python en el navegador
js/anim.js          animaciones de entrada al hacer scroll
cv/                 CV en PDF, español e inglés (los que descargan los botones)
img/                imagen de preview para compartir el link (ver img/LEEME.txt)
vercel.json         headers de caché para el deploy
```

## El CV

Los botones del header descargan `cv/Santiago-Massieri-CV-ES.pdf` y
`cv/Santiago-Massieri-CV-EN.pdf`.

Los PDF se generan desde los `.docx` originales (que viven en la carpeta de arriba,
`Documentos\Santiago`). Para regenerarlos después de editar un `.docx`, con Word instalado:

```bash
powershell -File scripts/cv-a-pdf.ps1
```

Si preferís hacerlo a mano: abrir el `.docx` en Word → Archivo → Guardar como → PDF,
y reemplazar el archivo en `cv/` respetando el nombre.

## Las animaciones

`js/anim.js` hace aparecer los elementos con un desplazamiento corto cuando entran en
pantalla. Tres cosas deliberadas:

- **Nada queda invisible nunca.** El CSS solo esconde los elementos si `<html>` tiene la
  clase `js` (que se agrega en el `<head>`), así que si el script no carga se ve todo.
  Además hay un barrido de respaldo: si el scroll pega un salto grande y el
  IntersectionObserver no llega a ver el cruce, el elemento se revela igual.
- **Respeta `prefers-reduced-motion`.** Si el sistema pide menos movimiento, no se anima
  nada y todo aparece visible de entrada.
- **Una sola vez por elemento.** No se re-animan al volver a subir.

Para cambiar la intensidad: `PASO` (retardo entre elementos de un grupo) en `js/anim.js`,
y la distancia del desplazamiento en `.js .reveal { transform: translateY(14px) }` dentro
de `css/styles.css`.

Para animar un elemento nuevo, agregale la clase `reveal`. Si querés que un grupo entre
escalonado, poné `data-stagger` en el contenedor.

## Ver el sitio localmente

Parado en esta carpeta:

```bash
python -m http.server 4321
```

y entrá a `http://localhost:4321`.

> Abrirlo con doble clic (`file://`) también muestra la página, pero conviene el
> server local para probar las consolas en las mismas condiciones que en Vercel.

## Las consolas interactivas

Cada proyecto tiene dos paneles: a la izquierda el código, a la derecha una
consola donde el visitante puede correr el script de verdad y tipear sus propios
números.

Eso funciona con [Pyodide](https://pyodide.org): CPython compilado a
WebAssembly, corriendo entero en el navegador. No hay servidor ejecutando nada.

Detalles que conviene saber:

- **El código que se muestra es el que se ejecuta.** `runner.js` lee el texto del
  panel de la izquierda (`textContent`), así que no hay dos copias que se puedan
  desincronizar. Para actualizar un script, editás el bloque
  `<code id="codigo-N">` en `index.html` y listo.
- **Pyodide se descarga recién al primer clic en "▶ Ejecutar"** (pesa varios MB).
  Después queda en caché del navegador y las corridas siguientes son inmediatas.
- **Dos adaptaciones automáticas** al correr en el navegador, hechas por
  `runner.js` sobre el texto del script, sin tocar la lógica:
  - `input(...)` → `await __ainput(...)`, porque en el navegador no se puede
    bloquear esperando al teclado. El script se corre con `runPythonAsync`.
  - `os.system('cls')` → `__clear()`, que limpia el div de la consola en vez de
    la pantalla de una terminal de Windows.
- **Corre un script por vez.** Si arrancás otro, el anterior se detiene solo.
- **Tope de salida**: si un script imprime más de 4000 líneas (por ejemplo, si
  alguien pide 5000 años de simulación) la ejecución se corta sola para no
  colgar la pestaña.

### Si querés editar un script

El código vive dentro de `<pre class="code"><code id="codigo-N">` en `index.html`.
Dos cuidados:

1. Las líneas van **pegadas al margen izquierdo** del archivo HTML. Si las
   indentás para que "quede prolijo", esa indentación pasa a ser parte del
   código Python y rompe la ejecución.
2. Un `<` literal hay que escribirlo `&lt;` y un `&`, `&amp;` (el `>` se puede
   dejar tal cual, pero está escrito como `&gt;` por prolijidad).

## Dependencias externas

Se cargan por CDN, no hay nada instalado:

- Pyodide, desde `cdn.jsdelivr.net` (se pide sólo al ejecutar).
- highlight.js, desde `cdnjs.cloudflare.com` (resaltado del código).

Si alguno no carga, la página sigue funcionando: el código se ve sin colores y
la consola avisa que no pudo cargar Python.

## Cambiar textos

Todo el texto está en `index.html`, en secciones marcadas con comentarios
(`<!-- ============ PROYECTOS ============ -->`, etc.).

Para sumar una herramienta, agregá un `<li class="chip">Nombre</li>` dentro de `<ul class="chips">`.

## Deploy en Vercel

**Opción A — sin Git (lo más rápido):**

1. Entrá a [vercel.com/new](https://vercel.com/new).
2. Arrastrá la carpeta entera del proyecto a la zona de "deploy".
3. Vercel detecta un sitio estático solo. No configures build command ni output directory.

**Opción B — con GitHub (recomendado si vas a seguir editando):**

1. Subí la carpeta a un repo de GitHub.
2. En Vercel: *Add New → Project → Import* ese repo.
3. Framework Preset: **Other**. Build Command: vacío. Output Directory: vacío (raíz).
4. Deploy. Cada `git push` vuelve a publicar solo.

## Colores

Están todos como variables al principio de `css/styles.css`:

```css
--accent: #123a5c;   /* azul marino, el único color de acento */
--bg:     #fafbfc;   /* fondo de la página */
```

Cambiando `--accent` cambia el acento de toda la página de una.
