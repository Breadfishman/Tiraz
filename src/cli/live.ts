import { realpathSync } from 'node:fs';
import path from 'node:path';
import { ClaudeCodeAgent, defaultAllowedTools } from '../core/agent';
import { loadConfig } from '../core/config';
import type { TirazConfig } from '../core/config';
import type { GenDeps } from '../core/gen';
import { createPlaywrightRenderer } from '../core/playwright-io';
import { bundledSkillsDir } from './bundled';

/** Absolute, symlink-resolved path of the running `tiraz` CLI script (for `tiraz shot`). */
export function tirazCliPath(): string | undefined {
  const script = process.argv[1];
  if (script === undefined) return undefined;
  try {
    return realpathSync(path.resolve(script));
  } catch {
    return undefined;
  }
}

/** The build agent, configured from `config.agent` (model, turn cap, permissions). */
export function createBuildAgent(config: TirazConfig, tirazCli?: string): ClaudeCodeAgent {
  return new ClaudeCodeAgent({
    ...(config.agent.model !== undefined ? { model: config.agent.model } : {}),
    maxTurns: config.agent.maxTurns,
    allowedTools: [...defaultAllowedTools(tirazCli), ...config.agent.allowedTools],
  });
}

/** Live dependencies for agent-driven commands (gen / breed / recombine / dashboard jobs). */
export async function liveDeps(cwd: string): Promise<GenDeps> {
  const { config } = await loadConfig(cwd);
  const tirazCli = tirazCliPath();
  return {
    agent: createBuildAgent(config, tirazCli),
    renderer: createPlaywrightRenderer({ appCommand: config.appCommand }),
    skillsSourceDir: bundledSkillsDir(),
    ...(tirazCli !== undefined ? { tirazCli } : {}),
  };
}
