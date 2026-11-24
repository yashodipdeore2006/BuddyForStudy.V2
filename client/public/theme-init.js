(() => {
  let preference = null;
  try { preference = window.localStorage.getItem("bfs-theme"); }
  catch { /* Theme preference is optional when browser storage is unavailable. */ }
  const systemDark = preference === "system" &&
    Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const useDark = preference === "dark" || systemDark;
  if (useDark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = useDark ? "dark" : "light";
})();
