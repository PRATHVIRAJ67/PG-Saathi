import 'react-native-url-polyfill/auto';
import * as Crypto from 'expo-crypto';

// Hermes has no Web Crypto. Idempotency keys need a secure random UUID.
const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T } };
g.crypto ??= {};
g.crypto.randomUUID ??= () => Crypto.randomUUID();
g.crypto.getRandomValues ??= (<T extends ArrayBufferView>(array: T) => Crypto.getRandomValues(array as never) as T) as never;
