import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelAllPracticeReminders,
  scheduleReminder,
} from '../../../shared/notifications/local_reminders';

test('local reminders safely no-op on web', async () => {
  const id = await scheduleReminder(new Date(Date.now() + 1_000), 'Test reminder');
  assert.ok(id === null || typeof id === 'string');
  await cancelAllPracticeReminders();
});
