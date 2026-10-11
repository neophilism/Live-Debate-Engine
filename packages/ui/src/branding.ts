export type Brand = Readonly<{ id: 'harbor' | 'cedar'; name: string; shortName: string; tagline: string }>;
/** Neutral reference brands. Branding is presentation, never a tenant or permission selector. */
export const BRANDS: Readonly<Record<Brand['id'], Brand>> = Object.freeze({
  harbor: Object.freeze({ id: 'harbor', name: 'Harbor Forum', shortName: 'HF', tagline: 'A place for considered disagreement.' }),
  cedar: Object.freeze({ id: 'cedar', name: 'Cedar Assembly', shortName: 'CA', tagline: 'Good arguments deserve a fair hearing.' }),
});
export function selectBrand(id: string): Brand {
  if (id !== 'harbor' && id !== 'cedar') throw new Error('Unknown reference brand');
  return BRANDS[id];
}
