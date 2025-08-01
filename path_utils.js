// path_utils.js

export function getRepoBasePath() {
    const fullPath = window.location.pathname;
    const repo = "MyMiTo";
  
    // Caso GitHub Pages
    if (fullPath.includes(`/${repo}/`)) {
      return `/${repo}/`;
    }
  
    // Calcolo profondità per uso locale
    const pathSegments = fullPath.split("/").filter(Boolean);
    const depth = Math.max(0, pathSegments.length - 1);
  
    return "../".repeat(depth);
  }
  
  export function getPath(relativePath) {
    return getRepoBasePath() + relativePath.replace(/^\/+/, "");
  }
  