import { Redirect, Tabs } from 'expo-router';
import { CreditCard, FileText, Home, User } from 'lucide-react-native';
import { colors, semantic } from '@pg/design-tokens';
import { useAuth } from '../../src/session';
import { font } from '../../src/ui';

export default function TabsLayout() {
  const { state } = useAuth();
  if (state.status === 'signed_out') return <Redirect href="/sign-in" />;
  if (state.status === 'signed_in' && state.session.mustChangePassword) return <Redirect href="/set-password" />;
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
      <Tabs.Screen name="bills" options={{ title: 'Bills', tabBarIcon: ({ color }) => <FileText size={22} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color }) => <CreditCard size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
