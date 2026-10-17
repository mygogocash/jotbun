// Test probe (parser-runner.spec): a parser that keeps allocating until its
// heap limit kills it.
const kept: string[][] = [];
for (;;) {
  kept.push(new Array<string>(100_000).fill(`row ${kept.length}`));
}
