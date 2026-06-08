import type { Manifest, NodeStatus, VariantNode } from './manifest';

const STATUS_MARK: Record<NodeStatus, string> = {
  generated: '·',
  scored: '○',
  survivor: '●',
  pruned: '✗',
  promoted: '★',
};

function compositeLabel(node: VariantNode): string {
  if (node.fitness === null) {
    return 'unscored';
  }
  const lint = node.fitness.lintFloor.passed ? 'lint✓' : 'lint✗';
  return `composite ${node.fitness.composite.toFixed(1)}  taste#${String(node.fitness.taste.rank)}  ${lint}`;
}

/**
 * Render the variant DAG by generation: each node's status, composite/taste/lint, and parent
 * lineage (SPEC §5 `tree`). Pure — returns a string for the CLI to print.
 */
export function renderTree(manifest: Manifest): string {
  const lines: string[] = [`Tiraz — ${manifest.project} (${manifest.mode})`];

  manifest.generations.forEach((ids, generation) => {
    lines.push(`\ngeneration ${String(generation)}`);
    for (const id of ids) {
      const node = manifest.nodes[id];
      if (node === undefined) {
        lines.push(`  ? ${id} (missing)`);
        continue;
      }
      const mark = STATUS_MARK[node.status];
      const lineage = node.genome.parents.length > 0 ? `  ⤴ ${node.genome.parents.join(', ')}` : '';
      lines.push(
        `  ${mark} ${id.padEnd(8)} ${node.status.padEnd(9)} ${compositeLabel(node)}${lineage}`,
      );
    }
  });

  if (manifest.final !== undefined) {
    lines.push(`\npromoted: ${manifest.final}`);
  }
  return lines.join('\n');
}

/** Render a one-line-per-status summary of the run (SPEC §5 `status`). */
export function renderStatus(manifest: Manifest): string {
  const counts: Record<NodeStatus, number> = {
    generated: 0,
    scored: 0,
    survivor: 0,
    pruned: 0,
    promoted: 0,
  };
  for (const node of Object.values(manifest.nodes)) {
    counts[node.status] += 1;
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const order: NodeStatus[] = ['generated', 'scored', 'survivor', 'pruned', 'promoted'];
  const breakdown = order.map((status) => `${status} ${String(counts[status])}`).join('  ');

  return [
    `Tiraz — ${manifest.project} (${manifest.mode})`,
    `generations: ${String(manifest.generations.length)}   nodes: ${String(total)}`,
    breakdown,
  ].join('\n');
}
