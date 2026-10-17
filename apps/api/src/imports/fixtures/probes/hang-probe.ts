// Test probe (parser-runner.spec): a parser stuck in a CPU loop, which only a
// kill stops. It does not read its input.
let spins = 0;
for (;;) {
  spins = (spins + 1) % 1_000_000;
}
