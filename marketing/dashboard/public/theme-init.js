// Apply the saved theme before first paint (no flash). Values: light | dark | system.
(function () {
  try {
    var t = localStorage.getItem("dhiti.theme") || "system";
    var d = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = d ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
