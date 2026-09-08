/* =========================================================
   runner.js — corre los scripts de Python del sitio dentro
   del navegador usando Pyodide (CPython compilado a WebAssembly).

   Como funciona:
   - El codigo que se ejecuta es el mismo texto que se muestra en el
     panel de la izquierda (se lee con textContent), asi nunca se
     desincronizan.
   - Pyodide se descarga recien al primer clic en "Ejecutar" (pesa
     bastante) y despues se reutiliza la misma instancia.
   - input() es bloqueante y eso no existe en el navegador, asi que
     se reescribe a "await __ainput(...)" y el script se corre con
     runPythonAsync, que permite await de nivel superior.
   - os.system('cls') se reescribe a __clear(), que limpia el div.
   ========================================================= */

(function () {
  'use strict';

  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

  var MAX_LINEAS = 4000;   // corte de seguridad: salida total por corrida
  var MAX_NODOS  = 800;    // cuantas lineas se mantienen en el DOM

  var ABORTADO = '__RUN_ABORTADO__';
  var LIMITE   = '__RUN_LIMITE__';

  var promesaPyodide = null;   // se resuelve una sola vez
  var corridaActiva  = null;   // { terminal: Terminal }

  /* ---------------------------------------------------------
     Carga de Pyodide
     --------------------------------------------------------- */

  function cargarScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('No se pudo cargar ' + url)); };
      document.head.appendChild(s);
    });
  }

  function obtenerPyodide() {
    if (!promesaPyodide) {
      promesaPyodide = cargarScript(PYODIDE_URL)
        .then(function () { return window.loadPyodide(); })
        .catch(function (err) {
          promesaPyodide = null;   // permite reintentar en el proximo clic
          throw err;
        });
    }
    return promesaPyodide;
  }

  /* ---------------------------------------------------------
     Adaptacion del codigo al navegador
     --------------------------------------------------------- */

  function adaptar(codigo) {
    return codigo
      .replace(/\bos\.system\(\s*(['"])cls\1\s*\)/g, '__clear()')
      .replace(/\binput\s*\(/g, 'await __ainput(');
  }

  /* ---------------------------------------------------------
     Terminal
     --------------------------------------------------------- */

  function Terminal(nodo) {
    this.nodo = nodo;
    this.lineas = 0;
    this.cancelarEntrada = null;
    var self = this;

    // Click en cualquier parte de la consola: foco al campo de entrada.
    nodo.addEventListener('mousedown', function (ev) {
      var campo = nodo.querySelector('.term-input');
      if (campo && ev.target !== campo) {
        // Timeout para no pelear con la seleccion de texto del click.
        setTimeout(function () { campo.focus({ preventScroll: true }); }, 0);
      }
    });
  }

  Terminal.prototype.alFinal = function () {
    this.nodo.scrollTop = this.nodo.scrollHeight;
  };

  Terminal.prototype.podar = function () {
    while (this.nodo.childElementCount > MAX_NODOS) {
      this.nodo.removeChild(this.nodo.firstElementChild);
    }
  };

  Terminal.prototype.limpiar = function () {
    this.nodo.textContent = '';
  };

  Terminal.prototype.escribir = function (texto, clase) {
    var fila = document.createElement('div');
    fila.className = 'term-line' + (clase ? ' ' + clase : '');
    fila.textContent = texto;
    this.nodo.appendChild(fila);
    this.podar();
    this.alFinal();
    return fila;
  };

  // Salida del script: cuenta lineas y corta si se va de escala.
  // Pyodide convierte este throw en un OSError adentro de Python, asi que
  // ademas dejamos marcado el flag para poder explicarlo despues.
  Terminal.prototype.salida = function (texto, clase) {
    this.lineas += 1;
    if (this.lineas > MAX_LINEAS) {
      this.excedido = true;
      throw new Error(LIMITE);
    }
    this.escribir(texto, clase);
  };

  // Pide un input(): devuelve una promesa con lo que escriba el usuario.
  Terminal.prototype.preguntar = function (textoPrompt) {
    var self = this;
    var prompt = (textoPrompt === undefined || textoPrompt === null)
      ? '' : String(textoPrompt);

    return new Promise(function (resolve, reject) {
      var fila = document.createElement('div');
      fila.className = 'term-line term-ask';

      var etiqueta = document.createElement('span');
      etiqueta.className = 'term-prompt';
      etiqueta.textContent = prompt;

      var campo = document.createElement('input');
      campo.type = 'text';
      campo.className = 'term-input';
      campo.autocomplete = 'off';
      campo.spellcheck = false;
      campo.setAttribute('aria-label', prompt || 'Entrada de la consola');

      fila.appendChild(etiqueta);
      fila.appendChild(campo);
      self.nodo.appendChild(fila);
      self.podar();
      self.alFinal();
      campo.focus({ preventScroll: true });

      function terminar() {
        campo.removeEventListener('keydown', alTeclear);
        self.cancelarEntrada = null;
      }

      function alTeclear(ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        var valor = campo.value;
        terminar();

        // Deja la linea como quedaria en una consola real: prompt + lo tipeado.
        var eco = document.createElement('span');
        eco.className = 'term-echo';
        eco.textContent = valor;
        fila.classList.remove('term-ask');
        fila.replaceChildren(etiqueta, eco);

        self.alFinal();
        resolve(valor);
      }

      campo.addEventListener('keydown', alTeclear);

      self.cancelarEntrada = function (err) {
        terminar();
        fila.remove();
        reject(err);
      };
    });
  };

  Terminal.prototype.abortar = function () {
    if (this.cancelarEntrada) {
      this.cancelarEntrada(new Error(ABORTADO));
    }
  };

  /* ---------------------------------------------------------
     Botones
     --------------------------------------------------------- */

  function estadoBoton(boton, estado) {
    boton.dataset.estado = estado;
    if (estado === 'cargando') {
      boton.textContent = 'Cargando Python…';
      boton.disabled = true;
    } else if (estado === 'corriendo') {
      boton.textContent = '■ Detener';
      boton.disabled = false;
    } else {
      boton.textContent = '▶ Ejecutar';
      boton.disabled = false;
    }
  }

  function esAborto(err) {
    return String(err && err.message ? err.message : err).indexOf(ABORTADO) !== -1;
  }

  function esLimite(err) {
    return String(err && err.message ? err.message : err).indexOf(LIMITE) !== -1;
  }

  // "consola — python evaluador_cedears.py" -> "evaluador_cedears.py"
  function nombreArchivo(boton) {
    var barra = boton.closest('.frame').querySelector('.frame-file');
    var partes = barra ? barra.textContent.split('python ') : [];
    return (partes[1] || 'script.py').trim();
  }

  async function ejecutar(boton) {
    var codigoNodo = document.getElementById(boton.dataset.codigo);
    var termNodo = document.getElementById(boton.dataset.term);
    if (!codigoNodo || !termNodo) return;

    var terminal = termNodo.__terminal || (termNodo.__terminal = new Terminal(termNodo));

    // Solo una corrida a la vez: la anterior se detiene.
    if (corridaActiva && corridaActiva.terminal !== terminal) {
      corridaActiva.terminal.abortar();
    }

    var codigo = codigoNodo.textContent;

    terminal.limpiar();
    terminal.lineas = 0;
    terminal.excedido = false;
    terminal.escribir('$ python ' + nombreArchivo(boton), 'term-sys');

    estadoBoton(boton, 'cargando');

    var aviso = null;
    if (!window.loadPyodide) {
      aviso = terminal.escribir(
        'Descargando Python (Pyodide)… la primera vez puede tardar unos segundos.',
        'term-sys'
      );
    }

    var pyodide;
    try {
      pyodide = await obtenerPyodide();
    } catch (err) {
      terminal.escribir('No se pudo cargar Python en el navegador: ' + err.message, 'term-err');
      terminal.escribir('Revisá tu conexión y probá de nuevo.', 'term-sys');
      estadoBoton(boton, 'listo');
      return;
    }

    if (aviso) aviso.textContent = 'Python listo.';

    estadoBoton(boton, 'corriendo');
    corridaActiva = { terminal: terminal, boton: boton };

    pyodide.setStdout({ batched: function (texto) { terminal.salida(texto); } });
    pyodide.setStderr({ batched: function (texto) { terminal.salida(texto, 'term-err'); } });

    var espacio = pyodide.toPy({
      __ainput: function (prompt) { return terminal.preguntar(prompt); },
      __clear: function () { terminal.limpiar(); }
    });

    try {
      await pyodide.runPythonAsync(adaptar(codigo), { globals: espacio });
      terminal.escribir('— proceso finalizado —', 'term-sys');
    } catch (err) {
      if (esAborto(err)) {
        terminal.escribir('— detenido —', 'term-sys');
      } else if (terminal.excedido || esLimite(err)) {
        terminal.escribir(
          '— la salida superó las ' + MAX_LINEAS + ' líneas y se detuvo la ejecución —',
          'term-sys'
        );
      } else {
        terminal.escribir(String(err.message || err).trim(), 'term-err');
      }
    } finally {
      espacio.destroy();
      if (corridaActiva && corridaActiva.terminal === terminal) corridaActiva = null;
      estadoBoton(boton, 'listo');
      terminal.alFinal();
    }
  }

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */

  function iniciar() {
    if (window.hljs) {
      document.querySelectorAll('code.language-python').forEach(function (bloque) {
        window.hljs.highlightElement(bloque);
      });
    }

    document.querySelectorAll('.frame-run').forEach(function (boton) {
      estadoBoton(boton, 'listo');
      boton.addEventListener('click', function () {
        if (boton.dataset.estado === 'corriendo') {
          var termNodo = document.getElementById(boton.dataset.term);
          if (termNodo && termNodo.__terminal) termNodo.__terminal.abortar();
          return;
        }
        ejecutar(boton);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
