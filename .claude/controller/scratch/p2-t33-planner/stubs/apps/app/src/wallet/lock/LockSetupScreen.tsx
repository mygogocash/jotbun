// RED stub (P2-T33): the real props; the view with nowhere to go.
import { LockSetupView } from './LockSetupView';

export function LockSetupScreen({ setup }: { setup: boolean }) {
  return <LockSetupView setup={setup} onBack={() => undefined} onNext={() => undefined} />;
}
