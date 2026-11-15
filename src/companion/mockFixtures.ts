// DEV-ONLY: loaded by companionApi only when import.meta.env.DEV and VITE_COMPANION_MOCK is set.
const files = import.meta.glob('../../calm-band/sim/fixtures/*.json', { import: 'default' });
export async function loadFixture(name: string): Promise<unknown> {
  const load = files[`../../calm-band/sim/fixtures/${name}.json`];
  if (!load) throw new Error(`no fixture ${name}`);
  return load();
}
