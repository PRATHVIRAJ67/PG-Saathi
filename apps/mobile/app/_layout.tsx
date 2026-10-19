import '../src/polyfills';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { AppError } from '@pg/api-client';
import { BackendProvider } from '@pg/api-client/react';
import { semantic } from '@pg/design-tokens';
import { createBackend } from '../src/backend';
import { AuthProvider } from '../src/session';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof AppError && error.code !== 'network' && error.code !== 'unknown') && count < 2,
    },
  },
});

export default function RootLayout() {
  const [backend] = useState(createBackend);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BackendProvider backend={backend}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: semantic.background }, animation: 'slide_from_right' }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="payment/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="resident/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="assign-bed" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="expense/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              </Stack>
            </AuthProvider>
          </QueryClientProvider>
        </BackendProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
