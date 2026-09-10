/* =========================================================
   anim.js — animaciones de entrada al hacer scroll.

   Criterio: que se note el movimiento pero que no distraiga.
   Desplazamientos cortos, una sola vez por elemento, y nada
   que retenga o secuestre el scroll.

   Accesibilidad: si el sistema pide menos movimiento
   (prefers-reduced-motion), no se anima nada y todo queda
   visible de entrada.

   Robustez: el contenido NUNCA puede quedar invisible.
   - El CSS solo esconde los elementos si <html> tiene la clase
     "js" (se agrega en el <head>), asi que si este archivo no
     carga, se ve todo.
   - Si no hay IntersectionObserver, se muestra todo de una.
   - IntersectionObserver solo avisa cuando muestrea un cambio de
     estado. Si el scroll salta rapido (rueda veloz, ancla, o el
     navegador restaurando la posicion), un elemento puede pasar
     de "abajo de la pantalla" a "arriba de la pantalla" sin que
     el observer lo vea nunca intersectando, y quedaria escondido
     para siempre. Por eso hay un barrido de respaldo en scroll.
   - Ese barrido revela SIN animar: si el elemento ya paso de largo, la
     transicion no la ve nadie, y si el usuario vuelve para arriba se
     encontraria una card a medio aparecer sin haber hecho nada.
   ========================================================= */

(function () {
  'use strict';

  var PASO = 45;      // ms de diferencia entre hermanos de un grupo
  var TOPE = 4;       // no escalonar mas alla de esto: se haria lento
  var DURACION = 380; // la transicion mas larga del CSS. Si cambia alla hay
                      // que cambiarla aca: de esto sale el plazo de limpieza.

  function revelar(nodo, sinAnimar) {
    if (nodo.classList.contains('is-visible')) return;

    // Camino de la red de seguridad: aparecer y listo, sin transicion.
    if (sinAnimar) {
      nodo.style.transitionDelay = '';
      nodo.classList.add('no-anim');
      nodo.classList.add('is-visible');
      return;
    }

    // will-change promueve el elemento a su propia capa de composicion. Se
    // pone justo antes de mover y se saca al terminar: dejarlo fijo mantiene
    // la capa viva para siempre, y son 26 elementos.
    nodo.style.willChange = 'opacity, transform';
    nodo.classList.add('is-visible');

    // El delay solo sirve para la entrada. Si queda puesto, cualquier
    // transicion posterior (hover, por ejemplo) arrancaria tarde.
    // El plazo sale de las constantes en vez de ser un numero suelto, y se
    // cuenta desde el delay propio de este elemento, no desde el del ultimo
    // hermano del grupo.
    var propio = parseFloat(nodo.style.transitionDelay) || 0;
    window.setTimeout(function () {
      nodo.style.transitionDelay = '';
      nodo.style.willChange = '';
    }, propio + DURACION + 120);
  }

  function iniciar() {
    var todos = [].slice.call(document.querySelectorAll('.reveal'));
    if (!todos.length) return;

    var menosMovimiento = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (menosMovimiento || !('IntersectionObserver' in window)) {
      for (var i = 0; i < todos.length; i++) {
        todos[i].classList.add('is-visible');
      }
      return;
    }

    // Escalonado: los .reveal que comparten un padre [data-stagger]
    // entran uno detras del otro en vez de todos juntos.
    var grupos = document.querySelectorAll('[data-stagger]');
    for (var g = 0; g < grupos.length; g++) {
      var hijos = grupos[g].querySelectorAll('.reveal');
      for (var h = 0; h < hijos.length; h++) {
        var turno = h < TOPE ? h : TOPE;
        hijos[h].style.transitionDelay = (turno * PASO) + 'ms';
      }
    }

    var pendientes = todos.slice();

    var observador = new IntersectionObserver(function (entradas) {
      for (var i = 0; i < entradas.length; i++) {
        if (!entradas[i].isIntersecting) continue;
        revelar(entradas[i].target, false);
        observador.unobserve(entradas[i].target);
      }
    }, {
      // Se dispara un poco antes de que el elemento toque el borde inferior,
      // para que llegue animado y no aparezca de golpe.
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.08
    });

    for (var j = 0; j < pendientes.length; j++) {
      observador.observe(pendientes[j]);
    }

    // --- Red de seguridad ---
    // Revela cualquier elemento que ya haya entrado (o pasado) la pantalla,
    // aunque el observer no lo haya registrado. Solo recorre lo que falta.
    // Usa temporizador y no requestAnimationFrame a proposito: rAF se pausa
    // en pestanas ocultas y este barrido tiene que correr igual.
    var agendado = null;

    function barrer() {
      agendado = null;
      var quedan = [];
      for (var k = 0; k < pendientes.length; k++) {
        var nodo = pendientes[k];
        if (nodo.classList.contains('is-visible')) continue;

        // Solo lo que ya quedo ARRIBA de la pantalla: eso el observer no lo
        // va a revelar nunca. Lo que esta a la vista se deja para el observer,
        // que es el que le da la animacion de entrada.
        if (nodo.getBoundingClientRect().bottom <= 0) {
          revelar(nodo, true);
          observador.unobserve(nodo);
        } else {
          quedan.push(nodo);
        }
      }
      pendientes = quedan;

      if (!pendientes.length) {
        window.removeEventListener('scroll', alScrollear);
        window.removeEventListener('resize', alScrollear);
        document.removeEventListener('visibilitychange', barrer);
      }
    }

    function alScrollear() {
      if (agendado) return;
      agendado = window.setTimeout(barrer, 120);
    }

    window.addEventListener('scroll', alScrollear, { passive: true });
    window.addEventListener('resize', alScrollear);
    // Al volver a una pestana que estuvo oculta, el observer pudo no haber
    // corrido nunca: hay que ponerse al dia.
    document.addEventListener('visibilitychange', barrer);

    barrer();   // primer barrido, por si la pagina abre ya scrolleada
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
