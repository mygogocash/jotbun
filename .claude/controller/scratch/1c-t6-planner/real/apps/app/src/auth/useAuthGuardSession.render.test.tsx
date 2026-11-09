// The layout guards' view of the session (Task 9 sends an ended session to
// /session-ended): signed in while the account is active, locked or ended by
// the server, and `ended` only for those last two (D37).
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { createBetterAuthPort } from '@mobile/auth/betterAuthPort';
import { createCredentialProvider } from '@mobile/auth/credentialProvider';
import { installCredentialProvider, setSession } from '@mobile/auth/session';
import type { SessionRecordStore, StoredSession } from '@mobile/auth/sessionStore';
import { createFakeAuthServer } from '@mobile/auth/testing/fakeAuthServer';
import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';

const EMAIL = 'kan@example.test';

afterEach(() => {
  cleanup();
  installCredentialProvider(null);
  setSession(null);
});

/** A record store whose first load waits until `release()`, so hydration can be seen in progress. */
function heldSessions(): SessionRecordStore & { release(): void } {
  let value: StoredSession | null = null;
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  return {
    release: () => release(),
    async load() { await held; return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

async function signedInProvider() {
  const server = createFakeAuthServer();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const sessions = heldSessions();
  const provider = createCredentialProvider({ port, sessions });
  installCredentialProvider(provider);
  const view = renderHook(() => useAuthGuardSession());
  expect(view.result.current).toEqual({ isAuthed: false, ready: true, ended: false });
  const hydrating = provider.hydrate();
  await waitFor(() => expect(provider.getSessionSnapshot().state).toBe('hydrating'));
  return { server, port, sessions, provider, view, hydrating };
}

test('no provider and no legacy token: signed out, ready, not ended', () => {
  const { result } = renderHook(() => useAuthGuardSession());
  expect(result.current).toEqual({ isAuthed: false, ready: true, ended: false });
});

test('active is signed in and not ended; hydrating is not ready yet', async () => {
  const { server, port, sessions, provider, view, hydrating } = await signedInProvider();
  expect(view.result.current).toEqual({ isAuthed: false, ready: false, ended: false });
  await act(async () => {
    sessions.release();
    await hydrating;
  });
  expect(view.result.current).toEqual({ isAuthed: false, ready: true, ended: false });
  await act(async () => {
    await port.sendEmailCode(EMAIL);
    await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  });
  expect(provider.getSessionSnapshot().state).toBe('active');
  expect(view.result.current).toEqual({ isAuthed: true, ready: true, ended: false });
});

test('a session the server ended, or a locked one, is still signed in, and ended', async () => {
  const { server, port, sessions, provider, view, hydrating } = await signedInProvider();
  await act(async () => {
    sessions.release();
    await hydrating;
    await port.sendEmailCode(EMAIL);
    await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  });
  // The server ended this session (a v1 refusal): reauth_required keeps the account.
  act(() => provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: provider.getSessionSnapshot().epoch }));
  expect(provider.getSessionSnapshot().state).toBe('reauth_required');
  expect(view.result.current).toEqual({ isAuthed: true, ready: true, ended: true });
  // Signed in again, then the session deleted at the server: the next token read locks it.
  await act(async () => {
    await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  });
  expect(view.result.current).toEqual({ isAuthed: true, ready: true, ended: false });
  const sessionId = provider.getSessionSnapshot().binding;
  if (sessionId) server.deleteSession(sessionId);
  await act(async () => { await provider.getAccessToken(); });
  expect(provider.getSessionSnapshot().state).toBe('locked');
  expect(view.result.current).toEqual({ isAuthed: true, ready: true, ended: true });
  // Signing out ends it all: signed out, not ended.
  await act(async () => { await provider.signOut(); });
  expect(view.result.current).toEqual({ isAuthed: false, ready: true, ended: false });
});

test('the legacy seam: a token is signed in, never ended', () => {
  setSession({ access_token: 'legacy-token', userId: 'u1' });
  const { result } = renderHook(() => useAuthGuardSession());
  expect(result.current).toEqual({ isAuthed: true, ready: true, ended: false });
});
