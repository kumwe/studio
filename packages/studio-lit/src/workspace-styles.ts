import { css, type CSSResult } from 'lit';

/** Browser chrome only. No workspace measurement becomes authored document data. */
export const canvasWorkspaceStyles: CSSResult = css`
  :host {
    container: studio-workspace / inline-size;
    min-inline-size: 0;
    --studio-border: #dfe3eb;
    --studio-panel: #ffffff;
    --studio-primary: #3157d5;
    --studio-muted: #596579;
    --studio-panel-width: clamp(18rem, 24vw, 22rem);
  }

  /* One structure column (outline, library disclosure, inspector) beside a
     page column that main.canvas spans. The middle row holds the library and
     collapses to nothing while the disclosure is closed. */
  .workspace {
    background: #eef1f6;
    block-size: var(--studio-workspace-height, clamp(32rem, 74vh, 62rem));
    grid-template-columns: var(--studio-panel-width) minmax(0, 1fr);
    grid-template-rows: minmax(8rem, 1fr) 0 minmax(10rem, 1fr) auto auto;
    min-block-size: 28rem;
    overflow: hidden;
  }

  .workspace[data-library='open'] {
    grid-template-rows: minmax(8rem, 0.9fr) minmax(8rem, 1.1fr) minmax(10rem, 0.8fr) auto auto;
  }

  .panel,
  .canvas {
    box-sizing: border-box;
    min-block-size: 0;
    padding: 0.875rem;
  }

  .library {
    border-block: 1px solid var(--studio-border);
    grid-column: 1;
    grid-row: 2;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .outline {
    grid-column: 1;
    grid-row: 1;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .outline:focus-visible {
    outline: 0.1875rem solid var(--studio-primary);
    outline-offset: -0.1875rem;
  }

  .canvas {
    background: #eef1f6;
    display: flex;
    flex-direction: column;
    grid-column: 2;
    grid-row: 1 / 4;
    overflow: auto;
    padding: 0;
    scrollbar-gutter: stable;
  }

  .inspector {
    grid-column: 1;
    grid-row: 3;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .pane-switcher {
    display: none;
  }

  /* The command palette is a workspace-level layer: Ctrl+K reaches it from
     any pane, and it never depends on the canvas pane being visible. */
  .command-palette {
    align-self: start;
    box-shadow: 0 0.5rem 2rem #18202a26;
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    inline-size: min(100% - 2rem, 36rem);
    justify-self: center;
    margin: 3rem 1rem 0;
    max-block-size: calc(100% - 4rem);
    overflow: auto;
    position: relative;
    z-index: 3;
  }

  .palette-block {
    touch-action: none;
  }

  .library-search {
    display: grid;
    font-size: 0.8125rem;
    gap: 0.375rem;
    margin-block-end: 0.75rem;
  }

  .library-search input {
    border: 1px solid var(--studio-border);
    border-radius: 0.375rem;
    box-sizing: border-box;
    font: inherit;
    inline-size: 100%;
    min-inline-size: 0;
    padding: 0.625rem;
  }

  .palette {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .palette button {
    align-items: center;
    block-size: 100%;
    display: flex;
    flex-direction: column;
    font-size: 0.8125rem;
    gap: 0.45rem;
    inline-size: 100%;
    justify-content: center;
    min-block-size: 4.5rem;
    overflow-wrap: break-word;
    padding: 0.625rem 0.375rem;
    text-align: center;
  }

  .palette button:hover:not(:disabled) {
    background: #f2f5ff;
    border-color: var(--studio-primary);
  }

  .block-symbol {
    align-items: center;
    border: 1px solid currentColor;
    border-radius: 0.2rem;
    display: inline-flex;
    font-size: 1rem;
    font-weight: 600;
    inline-size: 1.6rem;
    justify-content: center;
    line-height: 1.5;
  }

  .pattern-heading {
    margin-block-start: 1.25rem;
  }

  .pattern-palette {
    grid-template-columns: minmax(0, 1fr);
  }

  .pattern-palette button {
    align-items: flex-start;
    min-block-size: 2.5rem;
    padding-inline: 0.625rem;
    text-align: start;
  }

  .canvas-toolbar {
    align-items: center;
    background: white;
    border-block-end: 1px solid var(--studio-border);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    inset-block-start: 0;
    justify-content: space-between;
    margin: 0;
    padding: 0.5rem 0.75rem;
    position: sticky;
    z-index: 2;
  }

  .canvas > .breadcrumb {
    margin: 0;
    padding: 0.375rem 0.75rem;
  }

  .canvas-toolbar :is(.toolbar, .viewport-switcher, .command-palette-toggle) {
    margin: 0;
  }

  .canvas-toolbar button {
    font-size: 0.8125rem;
  }

  .preview-region {
    background: transparent;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .preview-status {
    font-size: 0.75rem;
  }

  .preview-stage {
    background: white;
    border: 0;
    box-shadow: none;
    min-block-size: 20rem;
  }

  .outline .tree {
    gap: 0.25rem;
  }

  .outline-entry {
    font-size: 0.8125rem;
    inline-size: 100%;
  }

  .node-children {
    margin-inline-start: 0.25rem;
    padding-inline-start: 0.5rem;
  }

  .outline-slot-label {
    color: var(--studio-muted);
    font-size: 0.75rem;
  }

  .inspector-slot {
    display: block;
    min-inline-size: 0;
  }

  .inspector-default[hidden] {
    display: none;
  }

  .scalar-control {
    display: grid;
    font-size: 0.8125rem;
    gap: 0.375rem;
    margin-block-end: 0.875rem;
  }
  .scalar-control :is(input, select, textarea) {
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
  }
  .scalar-checkbox {
    display: flex;
    align-items: center;
  }
  .scalar-checkbox input {
    inline-size: 1.125rem;
    block-size: 1.125rem;
    flex: 0 0 auto;
  }
  .scalar-control [aria-invalid='true'] {
    border-color: #a32929;
  }

  .inspector-selection {
    font-size: 1rem;
    margin: 0 0 0.75rem;
  }

  .inspector-advanced {
    border-block-start: 1px solid var(--studio-border);
    margin-block-start: 1rem;
    padding-block-start: 0.75rem;
  }

  .inspector-advanced > summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    margin-block-end: 0.75rem;
  }

  .diagnostics {
    grid-column: 1 / -1;
    grid-row: 4;
    max-block-size: 8rem;
    overflow: auto;
    padding-block: 0.5rem;
  }

  .diagnostics[data-empty='true'] {
    display: none;
  }

  .statusbar {
    background: white;
    font-size: 0.75rem;
    grid-column: 1 / -1;
    grid-row: 5;
    min-block-size: 2rem;
    padding: 0.375rem 0.875rem;
  }

  .workspace[data-contextual='true'] > .statusbar {
    display: none;
  }

  /* The closed disclosure hides the palette only at wide widths; the narrow
     Blocks sheet always shows it, so the landmark survives every sheet path. */
  @container studio-workspace (width >= 56rem) {
    .workspace[data-library='closed'] > .library {
      display: none;
    }
  }

  @container studio-workspace (width < 56rem) {
    .workspace,
    .workspace[data-library='open'] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      min-block-size: 28rem;
    }

    .diagnostics {
      grid-row: 3;
    }

    .statusbar {
      grid-row: 4;
    }

    .pane-switcher {
      background: white;
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      grid-column: 1;
      grid-row: 1;
      padding: 0.5rem;
    }

    .command-palette {
      grid-column: 1;
      grid-row: 1 / -1;
      margin-block-start: 3.5rem;
    }

    .pane-switcher button {
      flex: 1 1 auto;
      font-size: 0.8125rem;
      text-align: center;
    }

    .library,
    .outline,
    .inspector,
    .canvas {
      grid-column: 1;
      grid-row: 2;
      min-inline-size: 0;
    }

    .workspace:not([data-pane='library']) > .library,
    .workspace:not([data-pane='outline']) > .outline,
    .workspace:not([data-pane='inspector']) > .inspector,
    .workspace:not([data-pane='canvas']) > .canvas {
      display: none;
    }

    .palette {
      grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    }

    .pattern-palette {
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    }
  }
`;
