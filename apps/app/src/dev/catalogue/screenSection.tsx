// Screen sections for the catalogue (redesign R2c+, development only): the
// real redesigned screens, each in one state, drawn on fakes.
//
// `screenSection` gives every screen the same stage:
// - its own fakes (`fixture`), built afresh each time the section opens: the
//   in-memory resources from spend/v1/testing and, when the state needs one,
//   the fake device diary. No network, no sign-in.
// - the route params a screen reads with `useLocalSearchParams` (Quick add's
//   `copyOf`), through expo-router's own params context;
// - the catalogue's theme, locale and bun intensity, as for every section;
// - no top inset (the catalogue's header sits above the screen) and the real
//   bottom inset (the screen reaches the bottom edge).
//
// Many states only follow a few taps: a typed sum, an open sheet, a save that
// is still going. A section reaches them with a `script` that does what the
// screen's render test does with fireEvent, step by step: press a control by
// its label, type into a field, call a row's handler, change the fakes, wait
// for something to show. The screens are not changed for this, and expose no
// test hooks, so the script finds controls in React's own tree: a class
// component reads its fiber (`_reactInternals`), finds the current tree from
// the root, and calls the `onPress` / `onChangeText` props the screen gave its
// controls. That is a React internal, so it lives only here, in development
// code that never ships; the catalogue's render tests fail if it stops
// working. While a script runs the section reads `catalogue-screen-running`;
// if a step cannot be done it stops, says where in a strip over the screen,
// and reads `catalogue-screen-stopped`.
//
// The screens' own navigation (Close, Done, Back, a row's record) uses the
// app's real router, so it leaves the catalogue.
import { LocalRouteParamsContext } from 'expo-router/build/Route';
import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCopy } from '@mobile/i18n/useCopy';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import type { CatalogueSection } from './registry';

export type Translate = (english: string, values?: Readonly<Record<string, string | number>>) => string;

/** One thing a script does, the way a render test would. Labels are as the screen shows them, so pass them through `tc`. */
export type ScriptStep =
  /** Presses the enabled control with this accessibility label (or PillButton label). */
  | { readonly press: string }
  /** Types `type` into the field with the accessibility label `into`. */
  | { readonly type: string; readonly into: string }
  /** Calls the handler prop `call` on the first component whose props include every value in `on` (a row's onDelete, say). */
  | { readonly call: string; readonly on: Readonly<Record<string, unknown>>; readonly args?: readonly unknown[] }
  /** Waits until something with this label, text or testID shows. */
  | { readonly waitFor: string }
  /** Changes the fakes, as another device would. */
  | { readonly run: () => void };

/** What a screen state is drawn on. */
export type ScreenFixture = {
  /** The fake API (createFakeResources, maybe wrapped). */
  readonly resources: SpendV1Resources;
  /** The fake device diary, or null for none (as on the web). */
  readonly diary: SpendDiary | null;
  /** Route params for `useLocalSearchParams`. */
  readonly params?: Readonly<Record<string, string>>;
  /** Runs before the screen mounts. */
  readonly prepare?: () => Promise<void>;
};

export type ScreenSectionSpec<F extends ScreenFixture> = {
  /** The deep link's `section` value. */
  readonly id: string;
  /** "Home: over budget": the screen, then the state. */
  readonly title: string;
  /** Builds the fakes; called once each time the section opens. */
  readonly fixture: () => F;
  /** The steps from the screen's first frame to the state, if it needs any. */
  readonly script?: (tc: Translate, fixture: F) => readonly ScriptStep[];
  /** How long one step may wait for its control (default 8 s). */
  readonly stepTimeoutMs?: number;
  /** The screen, on the fixtures' clock. */
  readonly render: (fixture: F) => ReactNode;
};

export function screenSection<F extends ScreenFixture>(spec: ScreenSectionSpec<F>): CatalogueSection {
  return { id: spec.id, title: spec.title, group: 'Screens', layout: 'screen', render: () => <ScreenStage spec={spec} /> };
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  '.': 'Decimal point', '+': 'Plus', '-': 'Minus', '*': 'Times', '/': 'Divided by', '=': 'Equals', C: 'Clear', '<': 'Delete',
};

/** Keypad presses for `keys`: digits as themselves, `. + - * / =`, `C` (clear) and `<` (delete). */
export function keypadSteps(tc: Translate, keys: string): ScriptStep[] {
  return [...keys].map((key) => ({ press: KEY_LABELS[key] ? tc(KEY_LABELS[key]) : key }));
}

const NO_PARAMS: Readonly<Record<string, string>> = {};
const STEP_TIMEOUT_MS = 8000;
const POLL_MS = 20;
/** How long to wait for React to commit after a step before going on. */
const COMMIT_MS = 300;

function ScreenStage<F extends ScreenFixture>({ spec }: { spec: ScreenSectionSpec<F> }) {
  const tc = useCopy();
  const insets = useSafeAreaInsets();
  const [fixture] = useState(spec.fixture);
  const [prepared, setPrepared] = useState(!fixture.prepare);
  useEffect(() => {
    if (!fixture.prepare) return undefined;
    let live = true;
    void fixture.prepare().catch(() => undefined).then(() => {
      if (live) setPrepared(true);
    });
    return () => { live = false; };
  }, [fixture]);
  if (!prepared) return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
  const steps = spec.script ? spec.script(tc, fixture) : [];
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      <LocalRouteParamsContext.Provider value={fixture.params ?? NO_PARAMS}>
        <SpendV1Provider resources={fixture.resources}>
          <SpendDiaryProvider diary={fixture.diary}>
            <ScriptRunner steps={steps} stepTimeoutMs={spec.stepTimeoutMs ?? STEP_TIMEOUT_MS}>{spec.render(fixture)}</ScriptRunner>
          </SpendDiaryProvider>
        </SpendV1Provider>
      </LocalRouteParamsContext.Provider>
    </SafeAreaInsetsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// The script runner

/** The few fields of a React fiber the runner reads. */
type Fiber = {
  readonly child: Fiber | null;
  readonly sibling: Fiber | null;
  readonly return: Fiber | null;
  readonly stateNode: unknown;
  readonly memoizedProps: unknown;
};
type Props = Readonly<Record<string, unknown>>;
type FiberRoot = { readonly current: Fiber };

const propsOf = (fiber: Fiber): Props | null => (fiber.memoizedProps !== null && typeof fiber.memoizedProps === 'object' ? (fiber.memoizedProps as Props) : null);

/** The first fiber under `top` (depth first, in render order) that passes `test`. */
function findUnder(top: Fiber, test: (fiber: Fiber) => boolean): Fiber | null {
  const stack: Fiber[] = top.child ? [top.child] : [];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    if (test(fiber)) return fiber;
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  return null;
}

const named = (props: Props, name: string) => props.accessibilityLabel === name || props['aria-label'] === name || props.label === name;
const enabled = (props: Props) => props.disabled !== true && props.busy !== true && props['aria-disabled'] !== true;

function describe(step: ScriptStep): string {
  if ('press' in step) return `press “${step.press}”`;
  if ('type' in step) return `type into “${step.into}”`;
  if ('call' in step) return `call ${step.call} on ${JSON.stringify(step.on)}`;
  if ('waitFor' in step) return `wait for “${step.waitFor}”`;
  return 'change the fakes';
}

/** Whether a component's props are what the step acts on (or waits for). */
function targetOf(step: Exclude<ScriptStep, { run: () => void }>, props: Props): boolean {
  if ('press' in step) return typeof props.onPress === 'function' && named(props, step.press) && enabled(props);
  if ('type' in step) return typeof props.onChangeText === 'function' && named(props, step.into) && props.editable !== false;
  if ('call' in step) return typeof props[step.call] === 'function' && Object.entries(step.on).every(([key, value]) => props[key] === value);
  return named(props, step.waitFor) || props.testID === step.waitFor || props.children === step.waitFor;
}

type RunState = { readonly phase: 'running' | 'ready' } | { readonly phase: 'stopped'; readonly message: string };
type RunnerProps = { readonly steps: readonly ScriptStep[]; readonly stepTimeoutMs: number; readonly children: ReactNode };

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

class ScriptRunner extends Component<RunnerProps, RunState> {
  state: RunState = { phase: 'running' };
  private run = 0;

  componentDidMount() {
    this.run += 1;
    void this.play(this.run);
  }

  componentWillUnmount() {
    this.run += 1;
  }

  /** The React root this runner renders in. */
  private root(): FiberRoot | null {
    let fiber = (this as unknown as { _reactInternals?: Fiber })._reactInternals ?? null;
    while (fiber?.return) fiber = fiber.return;
    const root = fiber?.stateNode as FiberRoot | null | undefined;
    return root && typeof root === 'object' && 'current' in root ? root : null;
  }

  /** This runner's fiber in the tree on screen now. */
  private self(): Fiber | null {
    const root = this.root();
    if (!root) return null;
    if (root.current.stateNode === this) return root.current;
    return findUnder(root.current, (fiber) => fiber.stateNode === this);
  }

  private find(step: Exclude<ScriptStep, { run: () => void }>): Props | null {
    const self = this.self();
    if (!self) return null;
    const found = findUnder(self, (fiber) => {
      const props = propsOf(fiber);
      return props !== null && targetOf(step, props);
    });
    return found ? propsOf(found) : null;
  }

  /** Waits until React has committed again (or a moment has passed, when the step changed nothing). */
  private async committed(before: Fiber | undefined, live: () => boolean) {
    const until = Date.now() + COMMIT_MS;
    while (live() && Date.now() < until && this.root()?.current === before) await sleep(POLL_MS);
    await sleep(0);
  }

  private async play(run: number) {
    const live = () => this.run === run;
    const { steps, stepTimeoutMs } = this.props;
    for (const [index, step] of steps.entries()) {
      if (!live()) return;
      const before = this.root()?.current;
      if ('run' in step) {
        step.run();
        await this.committed(before, live);
        continue;
      }
      let props = this.find(step);
      const deadline = Date.now() + stepTimeoutMs;
      while (live() && !props && Date.now() < deadline) {
        await sleep(POLL_MS);
        props = this.find(step);
      }
      if (!live()) return;
      if (!props) {
        this.setState({ phase: 'stopped', message: `Script stopped at step ${index + 1} of ${steps.length}: ${describe(step)}.` });
        return;
      }
      const at = this.root()?.current;
      if ('press' in step) (props.onPress as () => void)();
      else if ('type' in step) (props.onChangeText as (text: string) => void)(step.type);
      else if ('call' in step) (props[step.call] as (...args: unknown[]) => void)(...(step.args ?? []));
      if (!('waitFor' in step)) await this.committed(at, live);
    }
    if (live()) this.setState({ phase: 'ready' });
  }

  render() {
    const { phase } = this.state;
    return (
      <View testID={`catalogue-screen-${phase}`} style={{ flex: 1 }}>
        {this.props.children}
        {this.state.phase === 'stopped' ? <StoppedStrip message={this.state.message} /> : null}
      </View>
    );
  }
}

/** Says where a script stopped, over the screen, so a screenshot cannot pass for the state. */
function StoppedStrip({ message }: { message: string }) {
  const colors = useBunColors();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: BUN_SPACE.sm, backgroundColor: colors.ink }}>
      <BunText variant="label" tone="onInk">{message}</BunText>
    </View>
  );
}
