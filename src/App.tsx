import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import MarinadesScreen from './screens/MarinadesScreen';

export type MainTabParamList = {
  Home: undefined;
  Logbook: undefined;
  Marinades: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  NewCook: undefined;
  Cook: undefined;
  CookDetail: { cookId: string };
  Calibration: undefined;
  Settings: undefined;
  MeatEdit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcon = (emoji: string) => ({ color }: { color: string }) =>
  <Text style={{ fontSize: 20, color, opacity: 1 }}>{emoji}</Text>;

function MainTabs() {
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: theme.colors.bg }}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.line },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textDim,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Grillmeister', tabBarLabel: 'Home', tabBarIcon: tabIcon('🔥') }} />
      <Tab.Screen name="Logbook" component={LogbookScreen} options={{ title: 'Logboek', tabBarIcon: tabIcon('📓') }} />
      <Tab.Screen name="Marinades" component={MarinadesScreen} options={{ title: 'Marinades', tabBarIcon: tabIcon('🧂') }} />
    </Tab.Navigator>
  );
}

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
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="NewCook" component={NewCookScreen} options={{ title: 'Nieuwe cook' }} />
            <Stack.Screen name="Cook" component={CookScreen} options={{ title: 'Live' }} />
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
