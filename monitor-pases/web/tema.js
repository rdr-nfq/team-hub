// Tema guardado antes de pintar (evita el parpadeo claro/oscuro).
// En el panel de VS Code llega el tema del editor en la URL (?tema=dark|light) y manda sobre el guardado.
try {
  var m = /[?&]tema=(dark|light)/.exec(location.search);
  var t = m ? m[1] : localStorage.getItem("mp-tema");
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
