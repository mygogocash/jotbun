// Every render test: Testing Library's `findBy…` and `waitFor` wait up to 4 s
// instead of 1 s. The suite runs two workers beside Metro and simulators on a
// busy machine, where a screen's async load sometimes took just over a second
// and a correct test failed (History long-press, Quick add, Reminders "off",
// each green alone). A real hang still fails, only a little later.
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
