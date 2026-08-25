/**
 * Private compile-time boundary for Editor.js.
 *
 * The upstream declarations are implementation detail and currently use
 * TypeScript syntax that is incompatible with Studio's stricter TS 6 build
 * profile. The root path mapping resolves type checking to this deliberately
 * opaque module while the emitted dynamic import remains
 * `@editorjs/editorjs`, so the real pinned runtime is still bundled.
 */
declare const EditorJS: unknown;

export default EditorJS;
