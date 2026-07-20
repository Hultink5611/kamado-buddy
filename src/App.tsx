import React, { useEffect } from 'react';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
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
import GuideScreen from './screens/GuideScreen';
import MoreScreen from './screens/MoreScreen';

export type MainTabParamList = {
  Home: undefined;
  Guide: undefined;
  CookAction: undefined;
  Marinades: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  NewCook: undefined;
  Cook: undefined;
  CookDetail: { cookId: string };
  Logbook: undefined;
  Calibration: undefined;
  Settings: undefined;
  MeatEdit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcon = (emoji: string) => ({ color }: { color: string }) =>
  <Text style={{ fontSize: 19, color }}>{emoji}</Text>;

/** Never shown — the tab is a shortcut that opens the "Nieuwe cook" flow. */
const CookPlaceholder = () => null;

/** Raised centre button that starts a new cook. */
function CookTabButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <View style={styles.fabWrap} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.fab} accessibilityLabel="Nieuwe cook">
        <Text style={styles.fabIcon}>🍖</Text>
        <Text style={styles.fabLabel}>Cook</Text>
      </Pressable>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: theme.colors.bg }}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.line, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textDim,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Grillmeister', tabBarLabel: 'Home', tabBarIcon: tabIcon('🔥') }} />
      <Tab.Screen name="Guide" component={GuideScreen} options={{ title: 'Kerntemperaturen', tabBarLabel: 'Gids', tabBarIcon: tabIcon('🌡️') }} />
      <Tab.Screen
        name="CookAction"
        component={CookPlaceholder}
        options={{ tabBarLabel: () => null, tabBarButton: (p) => <CookTabButton {...p} /> }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
            parent?.navigate('NewCook');
          },
        })}
      />
      <Tab.Screen name="Marinades" component={MarinadesScreen} options={{ title: 'Marinades', tabBarIcon: tabIcon('🧂') }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'Meer', tabBarIcon: tabIcon('⚙️') }} />
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
            <Stack.Screen name="Logbook" component={LogbookScreen} options={{ title: 'Logboek' }} />
            <Stack.Screen name="Calibration" component={CalibrationScreen} options={{ title: 'Kalibratie' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Instellingen' }} />
            <Stack.Screen name="MeatEdit" component={MeatEditScreen} options={{ title: 'Vlees beheren' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginTop: -22,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: { fontSize: 22, lineHeight: 24 },
  fabLabel: { fontSize: 9, fontWeight: '800', color: '#0d0f12', marginTop: -1 },
});
