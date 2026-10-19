import { Redirect, Tabs } from 'expo-router';
import { Building2, CreditCard, Home, Menu, Users } from 'lucide-react-native';
import { colors, semantic } from '@pg/design-tokens';
import { useAuth } from '../../src/session';
import { font } from '../../src/ui';

export default function TabsLayout() {
  const { state } = useAuth();
  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent[600],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: semantic.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="properties" options={{ title: 'Properties', tabBarIcon: ({ color }) => <Building2 size={22} color={color} /> }} />
      <Tabs.Screen name="residents" options={{ title: 'Residents', tabBarIcon: ({ color }) => <Users size={22} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color }) => <CreditCard size={22} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color }) => <Menu size={22} color={color} /> }} />
    </Tabs>
  );
}
