import type { Brand } from './types.js';

const brands: Readonly<Record<Brand['id'], Brand>> = Object.freeze({
  engine: Object.freeze({ id: 'engine', name: 'Live Debate Engine', monogram: 'LD', description: 'A considered space for rigorous debate.' }),
  'forum-house': Object.freeze({ id: 'forum-house', name: 'Forum House', monogram: 'FH', description: 'Ideas deserve a fair hearing.' }),
  'civic-exchange': Object.freeze({ id: 'civic-exchange', name: 'Civic Exchange', monogram: 'CE', description: 'Better conversations. Shared understanding.' }),
});
/** Deployment-selected reference brands, not client-selected tenant identity. */
export function resolveBrand(id: string): Brand {
  if (!Object.hasOwn(brands, id)) throw new Error('Unknown interface brand');
  return brands[id as Brand['id']];
}
