export const sv = {
  practice: {
    progress: {
      title: 'Träningsprogress',
      subtitleWindow: 'Senaste {{window}} dagarna',
      completedSummary: 'Genomfört {{completed}} av {{total}} rekommenderade pass',
      abandonedOnly: 'Du har startat uppdrag – slutför ett för att börja en streak.',
      streak: 'Träningsstreak: {{days}} dagar i rad',
      getStarted: 'Starta din första rekommenderade träning för att se utvecklingen här.',
      cta: 'Gå till range',
    },
    history: {
      title: 'Träningshistorik',
      loading: 'Laddar träningshistorik…',
      emptyTitle: 'Inga uppdrag än',
      emptyBody: 'Starta en rekommenderad session för att börja spåra din träning.',
      startCta: 'Starta rekommenderad träning',
      status: {
        completed: 'Slutförd',
        partial: 'Delvis',
        incomplete: 'Ej klar',
      },
      streakTag: 'Streakdag',
      samples: '{{completed}} slag',
      samplesWithTarget: '{{completed}} / {{target}} slag',
      anyClub: 'Valfri klubba',
      detail: {
        title: 'Träningsdetaljer',
        startedAt: 'Starttid',
        endedAt: 'Sluttid',
        clubs: 'Klubbor',
        samples: 'Genomförda slag',
        completion: 'Färdigställande',
        repeatCta: 'Upprepa mission',
        repeatTitle: 'Upprepa detta mission',
        repeatSubtitle: 'Starta en liknande snabbträning med samma klubbor och mål.',
        streakYes: 'Bidrog till din streak',
        streakNo: 'Påverkar inte din streak',
        unrepeatable: 'Inte tillräcklig info för att upprepa detta mission.',
        missing: 'Vi kunde inte ladda detta mission. Testa ett annat i din historik.',
        unknown: 'Okänt',
      },
    },
    missions: {
      title: 'Träningsuppdrag',
      cta: { viewAll: 'Visa alla missions' },
      status: {
        overdue: 'Hög prioritet',
        recommended: 'Rekommenderad',
        dueSoon: 'Snart dags',
        onTrack: 'På rätt spår',
        completedRecently: 'Nyligen klar',
      },
      empty: {
        title: 'Inga missions ännu',
        body: 'Spela några rundor eller rangepass så bygger vi ett anpassat träningsprogram åt dig.',
      },
    },
    goals: {
      summary: '{{completed}}/{{target}} missions den här veckan',
      emptyPrompt: 'Starta ditt första träningsmission den här veckan.',
      status: {
        onTrack: 'På rätt spår',
        catchUp: 'Kom ikapp',
      },
    },
    goal: {
      status: {
        goal_reached_title: 'Veckomål klart 🎉',
        exceeded_title: 'Du ligger före ditt mål',
      },
    },
  },
  practice_goal_streak_label: '{{count}} veckors svit',
  practice_plan_title: 'Veckans träningsplan',
  practice_plan_badge: 'Plan nr {{rank}}',
  bag: {
    practice: {
      recommendedTitle: 'Rekommenderad träning',
      recommendedHelper: 'Baserat på din bageredskap',
      startCta: 'Starta träning',
      status: {
        new: 'Nytt mission',
        due: 'Dags för finjustering',
        fresh: 'Håll det skarpt',
      },
      progress: {
        recent: '{{count}} pass de senaste {{days}} dagarna',
        empty: 'Inte tränat ännu',
        streak: 'På en streak',
      },
    },
  },
  home_dashboard_practice_next_title: 'Nästa mission',
  home_dashboard_practice_next_cta: 'Starta mission',
  round: {
    recap: {
      nextPracticeTitle: 'Nästa träningsmission',
      nextPracticeHelper: 'Baserat på din bag och träningshistorik rekommenderar vi:',
      nextPracticeCta: 'Starta mission',
    },
  },
};
