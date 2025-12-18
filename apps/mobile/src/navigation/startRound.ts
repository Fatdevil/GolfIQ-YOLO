import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { logRoundFlowGated } from '@app/analytics/roundFlow';
import type { RootStackParamList } from '@app/navigation/types';
import { isRoundFlowV2Enabled } from '@shared/featureFlags/roundFlowV2';

export type StartRoundSource = 'home' | 'play' | 'recap' | 'unknown';

type Navigation = Pick<
  NativeStackScreenProps<RootStackParamList, keyof RootStackParamList>['navigation'],
  'navigate'
>;

export function navigateToStartRound(
  navigation: Navigation,
  source: StartRoundSource = 'unknown',
): void {
  if (isRoundFlowV2Enabled()) {
    navigation.navigate('StartRoundV2');
    return;
  }

  logRoundFlowGated({ feature: 'roundFlowV2', target: 'start_round_entry', source });
  navigation.navigate('RoundStart');
}
