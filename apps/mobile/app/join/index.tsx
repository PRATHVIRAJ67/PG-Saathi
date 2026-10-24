import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Camera, QrCode } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { parseJoinCode } from '../../src/join';
import { Button, Card, Field, IconButton, Input, Screen, Txt } from '../../src/ui';

/** Scan the PG's join QR (or type the code), then fill in the join form. */
export default function JoinScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const go = (text: string) => {
    const code = parseJoinCode(text);
    if (!code) {
      setError('That isn’t a PG Sathi join QR. Ask your PG for their join QR code.');
      return false;
    }
    handled.current = true;
    router.replace(`/join/${code}`);
    return true;
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="heading">Join a PG</Txt>
      </View>
      <Txt>Scan the join QR code at your PG’s front desk, or the one they sent you.</Txt>

      <Card padded={false} style={{ overflow: 'hidden' }}>
        {permission?.granted ? (
          <View style={{ aspectRatio: 1, backgroundColor: colors.navy[900] }}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                go(data);
              }}
            />
            {/* Aiming frame */}
            <View pointerEvents="none" style={{ position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 20, opacity: 0.85 }} />
          </View>
        ) : (
          <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
              <QrCode size={26} color={colors.accent[600]} />
            </View>
            <Txt style={{ textAlign: 'center' }}>
              {permission && !permission.canAskAgain
                ? 'Camera access is off for PG Sathi. Turn it on in your phone’s Settings, or type the code below.'
                : 'Allow the camera to scan the QR code.'}
            </Txt>
            {(!permission || permission.canAskAgain) && <Button title="Allow camera" icon={Camera} onPress={() => void requestPermission()} />}
          </View>
        )}
      </Card>

      {error && (
        <Txt variant="caption" color={colors.danger[600]} style={{ textAlign: 'center' }}>
          {error}
        </Txt>
      )}

      <Card style={{ gap: 12 }}>
        <Field label="Or enter the code" hint="The letters and numbers at the end of the join link, or paste the whole link.">
          <Input value={manual} onChangeText={(v) => { setManual(v); setError(null); }} autoCapitalize="none" autoCorrect={false} placeholder="e.g. 3fe3eda314fd4e" accessibilityLabel="Join code" onSubmitEditing={() => go(manual)} />
        </Field>
        <Button title="Continue" variant="secondary" disabled={!manual.trim()} onPress={() => go(manual)} />
      </Card>
    </Screen>
  );
}
