// Local default config. Cloud deploys overwrite this file via scripts/build-web.mjs.
// Leaving window.__BINDERY_API_BASE__ undefined lets app.js auto-detect:
//   localhost  -> http://localhost:4311 (local API)
//   real host  -> "" (same-origin /api serverless function)
// To pin an explicit API base, uncomment and set:
// window.__BINDERY_API_BASE__ = "https://your-deployment.vercel.app";
window.BINDERY_WORKSPACE = window.BINDERY_WORKSPACE || "default";
