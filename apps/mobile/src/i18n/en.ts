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
  range: {
    history: {
      title: 'Range history',
      loading: 'Loading range history…',
      empty_title: 'No range history yet',
      empty_subtitle: 'Finish a Quick Practice session to see your progress here.',
      item_focus_direction: 'Focus: direction',
      item_focus_contact: 'Focus: contact',
      item_focus_distance: 'Focus: distance',
      item_shots: '{{count}} shots',
      view_history: 'View range history',
    },
    hub: {
      history_cta_title: 'Range history',
      history_cta_subtitle: 'See your recent practice sessions',
    },
    story: {
      solid_distance_work_on_direction: 'Solid distance – now tighten your direction',
      good_direction_work_on_distance: 'Great direction – now build more distance',
      consistent_hits_build_distance: 'Nice consistency – now build more distance',
      focus_on_contact: 'Let’s lock in clean contact first',
      direction_and_distance: 'Dial in both start line and carry next',
      section_strengths: 'What you did well',
      section_focus: 'What to focus on next',
      fallback_title: 'Range Story',
      fallback_body: 'Log more shots to see coaching notes.',
      strengths: {
        solid_distance: 'Your average carry was close to the target.',
        tight_direction: 'Your dispersion was fairly tight around the target.',
        good_volume: 'You hit enough balls to learn something from this bucket.',
      },
      improvements: {
        direction: 'Pick a smaller target and work on start line.',
        contact: 'Slow down the swing and focus on clean contact before adding speed.',
        distance: 'After a warm-up, gradually add speed while keeping balance.',
      },
    },
  },
} as const;

export type TranslationKeys = typeof en;
