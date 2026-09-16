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
  }

  .workspace {
    background: #eef1f6;
    block-size: var(--studio-workspace-height, clamp(32rem, 74vh, 62rem));
    grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr) minmax(15rem, 19rem);
    grid-template-rows: minmax(12rem, 1fr) minmax(8rem, 0.7fr) auto auto;
    min-block-size: 28rem;
    overflow: hidden;
  }

  .panel,
  .canvas {
    box-sizing: border-box;
    min-block-size: 0;
    padding: 0.875rem;
  }

  .library {
    grid-column: 1;
    grid-row: 1;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .outline {
    grid-column: 1;
    grid-row: 2;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .canvas {
    background: #eef1f6;
    grid-column: 2;
    grid-row: 1 / 3;
    overflow: auto;
    padding: 0.75rem 1rem 2rem;
    scrollbar-gutter: stable;
  }

  .inspector {
    grid-column: 3;
    grid-row: 1 / 3;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .pane-switcher {
    display: none;
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
    overflow-wrap: anywhere;
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
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    margin-block-end: 0.75rem;
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

  .preview-region > h2 {
    font-size: 0.75rem;
  }

  .preview-status {
    font-size: 0.75rem;
  }

  .preview-stage {
    background: white;
    border: 1px solid var(--studio-border);
    box-shadow: 0 0.25rem 1rem #18202a0d;
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
    grid-row: 3;
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
    grid-row: 4;
    min-block-size: 2rem;
    padding: 0.375rem 0.875rem;
  }

  .workspace[data-contextual='true'] > .statusbar {
    display: none;
  }

  @container studio-workspace (width < 56rem) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      min-block-size: 28rem;
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
