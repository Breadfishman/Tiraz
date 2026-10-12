import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import {
  BRAND_FILE,
  BRAND_SECTIONS,
  brandTemplate,
  brandUrls,
  cleanDraft,
  composeBrandDraftPrompt,
  loadBrand,
  missingSections,
} from '../core/brand';
import { describeError, loadConfig } from '../core/config';
import { REFS_DIR } from '../core/creative-context';
import { playwrightScreenshot } from '../core/playwright-io';
import { createBuildAgent } from './live';

/** Register `brand`: create, draft, check, and capture references for BRAND.md. */
export function registerBrandCommand(program: Command): void {
  const brand = program
    .command('brand')
    .description('The brand file (BRAND.md) that steers planning, building, and judging.');

  brand
    .command('init')
    .description('Write a BRAND.md template to fill in (never overwrites).')
    .action(async () => {
      const file = path.join(process.cwd(), BRAND_FILE);
      if (existsSync(file)) {
        console.log(
          `${BRAND_FILE} already exists — run \`tiraz brand check\` to see what's missing.`,
        );
        return;
      }
      await writeFile(file, brandTemplate(), 'utf8');
      console.log(`Wrote ${file}. Fill it in (or run \`tiraz brand draft\`), then commit it.`);
    });

  brand
    .command('draft')
    .description(
      'Draft BRAND.md from the existing site with a read-only agent (owner-only parts left as TODOs).',
    )
    .option(
      '--force',
      `Overwrite an existing ${BRAND_FILE} (default writes BRAND.draft.md instead)`,
    )
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();
      try {
        const { config } = await loadConfig(cwd);
        const agent = createBuildAgent(config);
        console.log('Reading the site and drafting the brand file (one read-only agent session)…');
        const result = await agent.run({
          cwd,
          prompt: composeBrandDraftPrompt(),
          skills: [],
          readOnly: true,
          maxTurns: 25,
          model: config.agent.plannerModel,
        });
        if (!result.ok || !result.output.includes('#')) {
          console.error(`Drafting failed: ${result.output.slice(0, 300)}`);
          process.exitCode = 1;
          return;
        }
        const target =
          existsSync(path.join(cwd, BRAND_FILE)) && options.force !== true
            ? 'BRAND.draft.md'
            : BRAND_FILE;
        await writeFile(path.join(cwd, target), cleanDraft(result.output), 'utf8');
        console.log(
          `Wrote ${target}. Answer the TODO(owner) items — especially sites you love/hate and what to never look like.`,
        );
      } catch (err) {
        console.error(describeError(err));
        process.exitCode = 1;
      }
    });

  brand
    .command('check')
    .description('Show which BRAND.md sections are filled in and which are still empty.')
    .action(async () => {
      const parsed = await loadBrand(process.cwd());
      if (parsed === null) {
        console.log(`No ${BRAND_FILE} here. Run \`tiraz brand init\` or \`tiraz brand draft\`.`);
        process.exitCode = 1;
        return;
      }
      const missing = new Set(missingSections(parsed));
      for (const section of BRAND_SECTIONS) {
        console.log(`  ${missing.has(section.key) ? '○' : '●'} ${section.title}`);
      }
      const loves = brandUrls(parsed, 'loves');
      console.log(
        `\n${String(BRAND_SECTIONS.length - missing.size)}/${String(BRAND_SECTIONS.length)} filled; ${String(loves.length)} reference URL(s) under "Sites we love".`,
      );
      if (loves.length > 0) console.log('Run `tiraz brand refs` to screenshot them for the judge.');
    });

  brand
    .command('refs')
    .description(
      'Screenshot the "Sites we love" URLs into .tiraz/refs (used by the planner, agents, and judge).',
    )
    .option('--max <n>', 'At most this many references (each costs judge tokens)', '3')
    .action(async (options: { max: string }) => {
      const cwd = process.cwd();
      const parsed = await loadBrand(cwd);
      const max = Math.max(0, Number.parseInt(options.max, 10) || 0);
      const urls = parsed === null ? [] : brandUrls(parsed, 'loves').slice(0, max);
      if (urls.length === 0) {
        console.log(`No URLs under "Sites we love" in ${BRAND_FILE}.`);
        return;
      }
      const dir = path.join(cwd, REFS_DIR);
      await mkdir(dir, { recursive: true });
      for (const old of (await readdir(dir)).filter((f) => /^love-\d+\.png$/.test(f))) {
        await rm(path.join(dir, old), { force: true });
      }
      let ok = 0;
      for (const [i, url] of urls.entries()) {
        const out = path.join(dir, `love-${String(i + 1)}.png`);
        try {
          await playwrightScreenshot(url, out, {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            timeoutMs: 45_000,
            fullPage: true,
            maxHeight: 2700,
          });
          ok += 1;
          console.log(`  ✓ ${url} → ${path.relative(cwd, out)}`);
        } catch (err) {
          console.warn(`  ✗ ${url}: ${describeError(err).split('\n')[0] ?? ''}`);
        }
      }
      console.log(`${String(ok)}/${String(urls.length)} reference(s) captured.`);
    });
}
