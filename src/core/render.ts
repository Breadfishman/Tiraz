import type { DetectedHarness } from './detect';

export interface RenderRequest {
  /** The variant's worktree (where the harness is built/served from). */
  worktreeDir: string;
  harness: DetectedHarness;
  /** Scoped target — a component path, route, or story id. */
  target: string;
  /** Port the harness server should bind to. */
  port: number;
  /** Absolute path the screenshot should be written to. */
  screenshotPath: string;
}

export interface RenderResult {
  /** URL the variant was rendered at (recorded on the node for the linter / VLM judge). */
  renderUrl: string;
  /** Absolute path to the captured screenshot. */
  screenshotPath: string;
}

/**
 * Renders a variant's target in its worktree and captures a screenshot (SPEC §7 step 1c–1d).
 * Deliberately an interface so the search engine and {@link import('./gen').runGen} stay
 * decoupled from the concrete (browser + harness-server) implementation. The live adapter
 * (Playwright + a booted Storybook/Ladle/Histoire server) requires a browser environment and
 * is verified outside the unit gate.
 */
export interface Renderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
