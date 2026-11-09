// Every render test: Testing Library's `findBy…` and `waitFor` wait up to 4 s
// instead of 1 s. The suite runs two workers beside Metro and simulators on a
// busy machine, where a screen's async load sometimes took just over a second
// and a correct test failed (History long-press, Quick add, Reminders "off",
// each green alone). A real hang still fails, only a little later.
//
// And each of those waits returns only once React's Scheduler has run the work
// it had queued, such as the passive effects of the commit the wait just saw.
// react-native-web wires presses in such effects: a Pressable takes its new
// `onPress` and `disabled` there, and a newly drawn one joins the responder
// system (which long-press needs) there. A screen that loads or saves outside
// act can commit in one task and run its effects in a later one, and on a busy
// machine the wait returned in between. The next press then met the old props
// (a Save still disabled from loading, a Try again still busy), so the wait for
// its outcome ran out at 4 s; or a long-press opened nothing, so History's
// "toolbar" was missing at once. CI runs 40616621319, 40618847092,
// 40618918299, 40620215604, 40620221538 and 40620228655 failed so. A person
// always presses after those effects, so tests now press in the order the app
// sees.
import { createRequire } from 'node:module';

import { configure, getConfig } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });

/** The two exports of the Scheduler used here. */
type Scheduler = {
  unstable_scheduleCallback: (priority: number, callback: () => null) => unknown;
  unstable_NormalPriority: number;
};
// The copy react-dom itself loads: resolved from react-dom's own folder.
const load = createRequire(import.meta.url);
const scheduler = load(load.resolve('scheduler', { paths: [load.resolve('react-dom')] })) as Scheduler;

/** Resolves after every task React had queued by now: a normal-priority task runs after those queued before it. */
const afterQueuedReactWork = () => new Promise<void>((resolve) => {
  scheduler.unstable_scheduleCallback(scheduler.unstable_NormalPriority, () => {
    resolve();
    return null;
  });
});

// Inside Testing Library's own wrapper, so the effects still run outside act, as during the wait itself.
const { asyncWrapper } = getConfig();
configure({
  asyncWrapper: (callback) => asyncWrapper(async () => {
    const result = await callback();
    await afterQueuedReactWork();
    return result;
  }),
});
