// Light/dark switch for gabs-utilities.com. Loaded in <head> without defer so a saved choice
// applies before the first paint; the button is wired once the page has parsed. The key is the
// one familiars.html uses, so one choice holds across the site.
(function () {
  var KEY = "familiars-theme";
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) {}
  function effective() {
    var chosen = root.getAttribute("data-theme");
    if (chosen === "light" || chosen === "dark") return chosen;
    return mq && mq.matches ? "light" : "dark";
  }
  function paint() {
    var e = effective();
    root.setAttribute("data-eff", e);
    var button = document.getElementById("theme-switch");
    if (!button) return;
    var next = e === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", "Switch to " + next + " mode");
    var label = button.querySelector(".label");
    if (label) label.textContent = next === "light" ? "Light mode" : "Dark mode";
  }
  paint();
  if (mq && mq.addEventListener) mq.addEventListener("change", paint);
  if (window.MutationObserver) new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  document.addEventListener("DOMContentLoaded", function () {
    paint();
    var button = document.getElementById("theme-switch");
    if (!button) return;
    button.addEventListener("click", function () {
      var next = effective() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      paint();
    });
  });
})();
