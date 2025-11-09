import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Linking } from 'react-native';

import linking from '@app/linking';
import type { RootStackParamList } from '@app/navigation/types';
import EventJoinScreen from '@app/screens/EventJoinScreen';
import EventLiveScreen from '@app/screens/EventLiveScreen';
import { extractJoinCode } from '@app/utils/deepLink';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
      <Stack.Navigator>
        <Stack.Screen name="EventJoin">
          {(props) => <EventJoinScreen {...props} initialCode={initialCode} />}
        </Stack.Screen>
        <Stack.Screen name="EventLive" component={EventLiveScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
