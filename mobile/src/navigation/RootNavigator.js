import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import { colors, spacing } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import POSScreen from '../screens/POSScreen';
import OrdersScreen from '../screens/OrdersScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StatistikaScreen from '../screens/StatistikaScreen';
import ReservationsScreen from '../screens/ReservationsScreen';

const Tab = createBottomTabNavigator();

function LogoutButton() {
  const { logout, perdoruesi } = useAuth();
  return (
    <Pressable
      onPress={logout}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12 }}>
        {perdoruesi?.emri || perdoruesi?.emri_perdoruesit}
      </Text>
      <Ionicons name="log-out-outline" size={22} color={colors.red} />
    </Pressable>
  );
}

const ICONS = {
  Krijo: 'add-circle',
  Porosite: 'receipt',
  Dashboard: 'grid',
  Statistika: 'stats-chart',
  Rezervime: 'calendar',
};

export default function RootNavigator() {
  const { perdoruesi, loading, isWaiter } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }

  if (!perdoruesi) return <LoginScreen />;

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerTitle: 'BitEat',
          headerTitleStyle: { fontWeight: '900', color: colors.primary },
          headerRight: () => <LogoutButton />,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={ICONS[route.name] || 'ellipse'}
              size={size}
              color={color}
            />
          ),
        })}
      >
        {isWaiter ? (
          <>
            <Tab.Screen name="Krijo" component={POSScreen} />
            <Tab.Screen name="Porosite" component={OrdersScreen} />
            <Tab.Screen name="Rezervime" component={ReservationsScreen} />
          </>
        ) : (
          <>
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Porosite" component={OrdersScreen} />
            <Tab.Screen name="Statistika" component={StatistikaScreen} />
            <Tab.Screen name="Rezervime" component={ReservationsScreen} />
          </>
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
