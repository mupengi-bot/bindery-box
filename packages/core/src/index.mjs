// @bindery-box/core (compatibility shim)
//
// The canonical entity layer moved to @bindery-box/domain as part of the
// platform-first migration (packages/core -> packages/domain). This module
// re-exports domain so older relative imports keep working.
export * from "../../domain/src/index.mjs";
