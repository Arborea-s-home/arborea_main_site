// path_utils.js (ESM)
const REPO = "arborea_main_site";

function dirname(path) {
  return path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "/");
}

export function getRepoBasePath() {
  const { protocol, pathname } = new URL(import.meta.url);
  // Se siamo su GitHub Pages (project pages), il modulo viene servito da /arborea_main_site/
  if (pathname.startsWith(`/${REPO}/`)) {
    return `/${REPO}/`;
  }
  // Altrimenti usa la directory in cui si trova path_utils.js come base assoluta
  return dirname(pathname);
}

export function getPath(relativePath) {
  const base = getRepoBasePath();
  return base.replace(/\/+$/, "/") + relativePath.replace(/^\/+/, "");
}
