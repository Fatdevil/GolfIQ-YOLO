import type { LinkingOptions } from '@react-navigation/native';

const prefixes = ['golfiq://', 'https://app.golfiq.app/'];

export const linking: LinkingOptions<any> = {
  prefixes,
  config: {
    screens: {
      PlayerHome: 'home',
      PlayCourseSelect: 'play',
      PlayTeeSelect: 'play/tee',
      PlayInRound: 'play/round',
      RoundStory: 'round/:runId',
      RangePractice: 'range',
      RangeQuickPracticeStart: 'range/quick/start',
      RangeCameraSetup: 'range/quick/setup',
      RangeQuickPracticeSession: 'range/quick/session',
      Trips: 'trips',
      EventJoin: 'join/:code?',
      EventLive: 'events/:id/live',
      EventScan: 'scan',
    },
  },
  getInitialURL: async () =>
    await Promise.resolve(
      await import('react-native').then((m) => m.Linking.getInitialURL()),
    ),
  subscribe: (listener) => {
    const { Linking } = require('react-native');
    const sub = Linking.addEventListener('url', ({ url }: { url: string }) => listener(url));
    return () => sub.remove();
  },
};

export default linking;
