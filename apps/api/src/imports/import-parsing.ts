// The job worker's import-parsing startup check (P2b review fixes). Before
// the worker registers `import_parse`, the parser runner starts each real
// parser child with exactly a parse's flags in its self-check mode
// (parser-runner, parsers/sandbox-check.ts). Unless both children are denied
// the network, file writes, processes and workers (and the rest of the
// sandbox holds), import parsing is disabled: the worker registers no
// `import_parse` handler, so it never claims one (queued imports wait, and
// the worker's backlog report names them each pass), and it logs one fixed
// line. Node's permission model denies the network only from Node 25 on, so
// on Node 24 (the image and CI runtime today) imports fail closed here.
import { failureName } from '../common/operational-metrics';
import type { ParseHandlerOptions } from './parse-handler';
import { ParserRunner } from './parser-runner';

/** `parse`: the handler options to register import_parse with, or null to leave it unregistered. */
export type ImportParsingStartup = { parse: ParseHandlerOptions | null; alert: string | null };

export async function importParsingStartup(runner: ParserRunner = new ParserRunner()): Promise<ImportParsingStartup> {
  try {
    const verdict = await runner.verifySandbox();
    if (verdict.supported) return { parse: { runner }, alert: null };
    return { parse: null, alert: `job worker: import parsing disabled (parser sandbox unsupported: ${verdict.reason})` };
  } catch (error) {
    // The failure's class or code only: never its text.
    return { parse: null, alert: `job worker: import parsing disabled (parser sandbox check failed: ${failureName(error)})` };
  }
}
