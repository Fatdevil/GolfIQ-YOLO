// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { bootstrapEventSession } from '@web/session/eventSession';

describe('bootstrapEventSession', () => {
  let originalSearch: string;

  beforeEach(() => {
    originalSearch = window.location.search;
    window.history.replaceState({}, '', `${window.location.pathname}`);
    localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}`);
    localStorage.clear();
  });

  it('returns admin role when query string sets admin=1', () => {
    window.history.replaceState({}, '', `${window.location.pathname}?admin=1`);
    expect(bootstrapEventSession()).toEqual({ role: 'admin', memberId: null, safe: false, tournamentSafe: false });
  });

  it('returns admin role when localStorage flag is set', () => {
    localStorage.setItem('event.admin', '1');
    expect(bootstrapEventSession()).toEqual({ role: 'admin', memberId: null, safe: false, tournamentSafe: false });
  });

  it('returns stored member id when available', () => {
    localStorage.setItem('event.memberId', 'member-42');
    expect(bootstrapEventSession()).toEqual({ role: 'spectator', memberId: 'member-42', safe: false, tournamentSafe: false });
  });

  it('returns spectator when no signals present', () => {
    expect(bootstrapEventSession()).toEqual({ role: 'spectator', memberId: null, safe: false, tournamentSafe: false });
  });
});
