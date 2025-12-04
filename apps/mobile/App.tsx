import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Linking } from 'react-native';

import linking from '@app/linking';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import EventJoinScreen from '@app/screens/EventJoinScreen';
import EventLiveScreen from '@app/screens/EventLiveScreen';
import EventScanScreen from '@app/screens/EventScanScreen';
import HomeScreen from '@app/screens/HomeScreen';
import RangePracticeScreen from '@app/screens/RangePracticeScreen';
import RangeProgressScreen from '@app/screens/RangeProgressScreen';
import RangeQuickPracticeSessionScreen from '@app/screens/RangeQuickPracticeSessionScreen';
import RangeQuickPracticeStartScreen from '@app/screens/RangeQuickPracticeStartScreen';
import RangeCameraSetupScreen from '@app/screens/RangeCameraSetupScreen';
import RangeQuickPracticeSummaryScreen from '@app/screens/RangeQuickPracticeSummaryScreen';
import RangeHistoryScreen from '@app/screens/RangeHistoryScreen';
import RangeSessionDetailScreen from '@app/screens/RangeSessionDetailScreen';
import RangeTrainingGoalScreen from '@app/screens/RangeTrainingGoalScreen';
import RangeMissionsScreen from '@app/screens/RangeMissionsScreen';
import TripsScreen from '@app/screens/TripsScreen';
import CaddieApproachScreen from '@app/screens/CaddieApproachScreen';
import CaddieSetupScreen from '@app/screens/CaddieSetupScreen';
import RoundHistoryScreen from '@app/screens/RoundHistoryScreen';
import PlayerStatsScreen from '@app/screens/PlayerStatsScreen';
import CategoryStatsScreen from '@app/screens/CategoryStatsScreen';
import { registerWatchTempoTrainerBridge } from '@app/watch/watchConnectivity';
import { extractJoinCode } from '@app/utils/deepLink';
import CourseSelectScreen from '@app/screens/play/CourseSelectScreen';
import TeeSelectScreen from '@app/screens/play/TeeSelectScreen';
import InRoundScreen from '@app/screens/play/InRoundScreen';
import RoundSavedScreen from '@app/screens/RoundSavedScreen';
import RoundStoryScreen from '@app/screens/RoundStoryScreen';
import ClubDistancesScreen from '@app/screens/ClubDistancesScreen';
import MyBagScreen from '@app/screens/MyBagScreen';
import RoundStartScreen from '@app/screens/RoundStartScreen';
import RoundShotScreen from '@app/screens/RoundShotScreen';
import RoundRecapScreen from '@app/screens/RoundRecapScreen';
import RoundSummaryScreen from '@app/screens/RoundSummaryScreen';
import RoundScorecardScreen from '@app/screens/RoundScorecardScreen';
import WeeklySummaryScreen from '@app/screens/WeeklySummaryScreen';
import PracticePlannerScreen from '@app/screens/PracticePlannerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

registerWatchTempoTrainerBridge();

export default function App(): JSX.Element {
  const [initialCode, setInitialCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (cancelled) {
          return;
        }
        const code = extractJoinCode(url);
        if (code) {
          setInitialCode(code);
        }
      } catch {
        // ignore missing initial URL
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName="PlayerHome">
        <Stack.Screen name="PlayerHome" component={HomeScreen} options={{ title: 'Home' }} />
        <Stack.Screen
          name="PlayCourseSelect"
          component={CourseSelectScreen}
          options={{ title: 'Choose course' }}
        />
        <Stack.Screen name="PlayTeeSelect" component={TeeSelectScreen} options={{ title: 'Select tee' }} />
        <Stack.Screen name="PlayInRound" component={InRoundScreen} options={{ title: 'In round' }} />
        <Stack.Screen name="RoundStory" component={RoundStoryScreen} options={{ title: 'Round story' }} />
        <Stack.Screen name="RoundSaved" component={RoundSavedScreen} options={{ title: 'Round saved' }} />
        <Stack.Screen name="RoundStart" component={RoundStartScreen} options={{ title: 'Start round' }} />
        <Stack.Screen name="RoundShot" component={RoundShotScreen} options={{ title: 'Log shots' }} />
        <Stack.Screen
          name="RoundRecap"
          component={RoundRecapScreen}
          options={{ title: t('round.recap.title') }}
        />
        <Stack.Screen name="RoundSummary" component={RoundSummaryScreen} options={{ title: 'Round summary' }} />
        <Stack.Screen name="RoundScorecard" component={RoundScorecardScreen} options={{ title: 'Scorecard' }} />
        <Stack.Screen
          name="WeeklySummary"
          component={WeeklySummaryScreen}
          options={{ title: t('weeklySummary.title') }}
        />
        <Stack.Screen
          name="PracticePlanner"
          component={PracticePlannerScreen}
          options={{ title: t('practice_planner_title') }}
        />
        <Stack.Screen
          name="RoundHistory"
          component={RoundHistoryScreen}
          options={{ title: t('round.history.title') }}
        />
        <Stack.Screen
          name="PlayerStats"
          component={PlayerStatsScreen}
          options={{ title: t('stats.player.title') }}
        />
        <Stack.Screen
          name="CategoryStats"
          component={CategoryStatsScreen}
          options={{ title: t('stats.player.categories.detail_title') }}
        />
        <Stack.Screen
          name="RangePractice"
          component={RangePracticeScreen}
          options={{ title: 'Range practice' }}
        />
        <Stack.Screen
          name="RangeMissions"
          component={RangeMissionsScreen}
          options={{ title: t('range.missions.screen_title') }}
        />
        <Stack.Screen
          name="RangeTrainingGoal"
          component={RangeTrainingGoalScreen}
          options={{ title: 'Training goal' }}
        />
        <Stack.Screen
          name="RangeQuickPracticeStart"
          component={RangeQuickPracticeStartScreen}
          options={{ title: 'Quick practice' }}
        />
        <Stack.Screen
          name="RangeCameraSetup"
          component={RangeCameraSetupScreen}
          options={{ title: 'Camera setup' }}
        />
        <Stack.Screen
          name="RangeQuickPracticeSession"
          component={RangeQuickPracticeSessionScreen}
          options={{ title: 'Quick practice session' }}
        />
        <Stack.Screen
          name="RangeQuickPracticeSummary"
          component={RangeQuickPracticeSummaryScreen}
          options={{ title: 'Quick practice summary' }}
        />
        <Stack.Screen name="RangeHistory" component={RangeHistoryScreen} options={{ title: 'Range history' }} />
        <Stack.Screen
          name="RangeProgress"
          component={RangeProgressScreen}
          options={{ title: t('range.progress.screen_title') }}
        />
        <Stack.Screen
          name="RangeSessionDetail"
          component={RangeSessionDetailScreen}
          options={{ title: 'Range session' }}
        />
        <Stack.Screen
          name="MyBag"
          component={MyBagScreen}
          options={{ title: t('my_bag_title') }}
        />
        <Stack.Screen
          name="ClubDistances"
          component={ClubDistancesScreen}
          options={{ title: t('clubDistances.title') }}
        />
        <Stack.Screen
          name="CaddieApproach"
          component={CaddieApproachScreen}
          options={{ title: t('caddie.decision.screen_title') }}
        />
        <Stack.Screen
          name="CaddieSetup"
          component={CaddieSetupScreen}
          options={{ title: t('caddie.setup.title') }}
        />
        <Stack.Screen name="Trips" component={TripsScreen} options={{ title: 'Trips' }} />
        <Stack.Screen name="EventJoin">
          {(props) => <EventJoinScreen {...props} initialCode={initialCode} />}
        </Stack.Screen>
        <Stack.Screen name="EventLive" component={EventLiveScreen} />
        <Stack.Screen name="EventScan" component={EventScanScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
