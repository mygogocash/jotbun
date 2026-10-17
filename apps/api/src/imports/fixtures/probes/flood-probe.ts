// Test probe (parser-runner.spec): a parser that writes output without end.
const block = 'x'.repeat(1024 * 1024);
function write(): void {
  while (process.stdout.write(block)) {
    // keep writing until the pipe is full
  }
  process.stdout.once('drain', write);
}
write();
