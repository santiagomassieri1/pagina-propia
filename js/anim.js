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
   ========================================================= */

(function () {
  'use strict';

  var PASO = 70;      // ms de diferencia entre hermanos de un grupo
  var TOPE = 6;       // no escalonar mas alla de esto: se haria lento

  function revelar(nodo) {
    if (nodo.classList.contains('is-visible')) return;
    nodo.classList.add('is-visible');

    // El delay solo sirve para la entrada. Si queda puesto, cualquier
    // transicion posterior (hover, por ejemplo) arrancaria tarde.
    window.setTimeout(function () {
      nodo.style.transitionDelay = '';
    }, 900);
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
        revelar(entradas[i].target);
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
          revelar(nodo);
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
