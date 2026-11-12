// Prints the derived material of candidate sample wallet ids (walletLooks.ts's FNV-1a rule).
const MATERIALS = ['silk', 'paper', 'titanium', 'sky', 'peach'];
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}
for (const id of process.argv.slice(2)) console.log(id, MATERIALS[fnv1a(id) % 5]);
