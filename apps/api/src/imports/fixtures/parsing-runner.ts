// Test-only parser runners (P2b review fixes). Never used outside specs.
//
// Node's permission model restricts the network only from Node 25 on
// (`--allow-net`); on Node 24 a parser child can open sockets. The runner
// therefore verifies the sandbox before any parse and refuses every parse on
// a runtime where the child is not denied the network (sandbox_unsupported).
// The sandbox specs assert that verdict on whichever runtime runs them. The
// specs about *parsing* (amounts, dates, layouts, workbooks, images) are about
// the parser, not the runtime, so on a runtime without network permission
// they use UngatedParserRunner: the same children, flags and checks, minus
// the sandbox gate.
import { ParserRunner } from '../parser-runner';
import type { ChildLaunch, ParserRunnerOptions, SandboxFamily, SandboxVerdict } from '../parser-runner';
import type { ParseFormat } from '../parsers/protocol';

export const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
/** Whether this runtime's permission model can deny a child the network. */
export const NET_PERMISSION = NODE_MAJOR >= 25;

/** The real children without the sandbox gate: parsing behaviour only. */
export class UngatedParserRunner extends ParserRunner {
  protected override async verify(_family: SandboxFamily): Promise<SandboxVerdict> {
    return { supported: true };
  }
}

/** The runner parse-behaviour specs use: the real, gated one wherever the sandbox can hold. */
export function parsingRunner(options: ParserRunnerOptions = {}): ParserRunner {
  return NET_PERMISSION ? new ParserRunner(options) : new UngatedParserRunner(options);
}

/**
 * A runtime that lets the child use the network: on Node 25+ the real flags
 * plus `--allow-net`; on Node 24 the real flags already are such a runtime.
 */
export class OpenNetRunner extends ParserRunner {
  override launch(format: ParseFormat, entryOverride?: string): ChildLaunch {
    const launch = super.launch(format, entryOverride);
    if (!process.allowedNodeEnvironmentFlags.has('--allow-net')) return launch;
    return { ...launch, args: ['--allow-net', ...launch.args] };
  }
}
