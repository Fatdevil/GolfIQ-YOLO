import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API } from '@web/api';
import { fetchEventSession } from '@web/session/eventSession';

describe('fetchEventSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests admin session data with memberId', async () => {
    const spy = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { role: 'admin', memberId: 'host-1', safe: false, ts: 'now' },
    });

    const session = await fetchEventSession('evt-1', 'host-1');

    expect(spy).toHaveBeenCalledWith(
      `${API}/events/evt-1/session`,
      expect.objectContaining({ params: { memberId: 'host-1' } }),
    );
    expect(session).toEqual({ role: 'admin', memberId: 'host-1', safe: false });
  });

  it('defaults safe flag when server omits it', async () => {
    const spy = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { role: 'spectator', memberId: null, ts: 'later' },
    });

    const session = await fetchEventSession('evt-2', null);

    expect(spy).toHaveBeenCalledWith(
      `${API}/events/evt-2/session`,
      expect.objectContaining({ params: undefined }),
    );
    expect(session).toEqual({ role: 'spectator', memberId: null, safe: false });
  });

  it('propagates safe=true from response', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { role: 'admin', memberId: 'host-9', safe: true, ts: 'future' },
    });

    const session = await fetchEventSession('evt-3', 'host-9');

    expect(session.safe).toBe(true);
    expect(session.role).toBe('admin');
  });
});
