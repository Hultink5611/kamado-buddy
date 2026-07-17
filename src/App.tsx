import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider } from './state/AppContext';
import { setupNotifications } from './logic/notifications';
import { theme } from './theme';

import HomeScreen from './screens/HomeScreen';
import NewCookScreen from './screens/NewCookScreen';
import CookScreen from './screens/CookScreen';
import LogbookScreen from './screens/LogbookScreen';
import CookDetailScreen from './screens/CookDetailScreen';
import CalibrationScreen from './screens/CalibrationScreen';
import SettingsScreen from './screens/SettingsScreen';
import MeatEditScreen from './screens/MeatEditScreen';

export type RootStackParamList = {
  Home: undefined;
  NewCook: undefined;
  Cook: undefined;
  Logbook: undefined;
  CookDetail: { cookId: string };
  Calibration: undefined;
  Settings: undefined;
  MeatEdit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
    text: theme.colors.text,
    border: theme.colors.line,
    primary: theme.colors.accent,
  },
};

export default function App() {
  useEffect(() => {
    void setupNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.bg },
              headerTintColor: theme.colors.text,
              contentStyle: { backgroundColor: theme.colors.bg },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Grillmeister' }} />
            <Stack.Screen name="NewCook" component={NewCookScreen} options={{ title: 'Nieuwe cook' }} />
            <Stack.Screen name="Cook" component={CookScreen} options={{ title: 'Live' }} />
            <Stack.Screen name="Logbook" component={LogbookScreen} options={{ title: 'Logboek' }} />
            <Stack.Screen name="CookDetail" component={CookDetailScreen} options={{ title: 'Cook' }} />
            <Stack.Screen name="Calibration" component={CalibrationScreen} options={{ title: 'Kalibratie' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Instellingen' }} />
            <Stack.Screen name="MeatEdit" component={MeatEditScreen} options={{ title: 'Vlees beheren' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
