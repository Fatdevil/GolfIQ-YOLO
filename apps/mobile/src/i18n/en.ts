export const en = {
  home: {
    range: {
      title: 'Range & Training',
      subtitle: 'Start a quick practice session',
      cta: 'Start Quick Practice',
      missionsTeaser: 'Planned missions (coming soon)',
      lastSession: {
        none: 'No recent range session',
        label: 'Last: {{club}} \u00b7 {{shots}} shots',
        label_no_club: 'Last: {{shots}} shots',
        label_club_only: 'Last: {{club}}',
        anyClub: 'Any club',
      },
    },
  },
} as const;

export type TranslationKeys = typeof en;
