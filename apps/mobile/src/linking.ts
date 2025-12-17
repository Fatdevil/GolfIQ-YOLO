import type { LinkingOptions } from '@react-navigation/native';

const prefixes = ['golfiq://', 'https://app.golfiq.app/'];

export const linking: LinkingOptions<any> = {
  prefixes,
  config: {
    screens: {
      HomeDashboard: 'home',
      PlayerHome: 'player-home',
      PlayCourseSelect: 'play',
      PlayTeeSelect: 'play/tee',
      PlayInRound: 'play/round',
      RoundStory: 'round/:runId',
      CoachReport: 'coach/report/:roundId',
      RoundHistory: 'rounds',
      PlayerStats: 'stats/player',
      CategoryStats: 'stats/player/categories',
      RangePractice: 'range',
      RangeMissions: 'range/missions',
      PracticeMissions: 'practice/missions',
      PracticeJournal: 'practice/journal',
      WeeklyPracticeGoalSettings: 'practice/goal-settings',
      PracticeHistory: 'practice/history',
      RangeQuickPracticeStart: 'range/quick/start',
      RangeCameraSetup: 'range/quick/setup',
      CaddieSetup: 'caddie/setup',
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
