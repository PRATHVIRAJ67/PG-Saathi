import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Camera, QrCode, ScanLine } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { parseJoinCode } from '../../src/join';
import { Button, Card, Field, IconButton, Input, Screen, Txt } from '../../src/ui';

/**
 * Scan the PG's join QR (or type the code), then fill in the join form.
 *
 * The main path is the system scanner (Google code scanner on Android, VisionKit
 * on iPhone): full screen, handles focus, glare and low light, and needs no
 * camera permission on Android. Phones without it get an in-page camera.
 */
export default function JoinScan() {
  const native = CameraView.isModernBarcodeScannerAvailable;
  const [permission, requestPermission] = useCameraPermissions();
  const [inline, setInline] = useState(!native);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  // Fixed pixel size: an aspect-ratio box inside an animated card was measured
  // mid-animation on Android, squashing the preview.
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 420);
  const frame = Math.round(size * 0.64);

  const go = (text: string) => {
    if (handled.current) return true;
    const code = parseJoinCode(text);
    if (!code) {
      setError('That isn’t a PG Sathi join QR. Ask your PG for their join QR code.');
      return false;
    }
    handled.current = true;
    if (Platform.OS === 'ios') void CameraView.dismissScanner().catch(() => undefined);
    router.replace(`/join/${code}`);
    return true;
  };

  useEffect(() => {
    if (!native) return;
    const sub = CameraView.onModernBarcodeScanned(({ data }) => go(data));
    return () => sub.remove();
  }, [native]);

  const openScanner = async () => {
    setError(null);
    handled.current = false;
    try {
      await CameraView.launchScanner({ barcodeTypes: ['qr'], isHighlightingEnabled: true });
    } catch {
      // No system scanner on this phone after all: use the in-page camera.
      setInline(true);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Txt variant="heading">Join a PG</Txt>
      </View>
      <Txt>Scan the join QR code at your PG’s front desk, or the one they sent you.</Txt>

      {!inline ? (
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
            <QrCode size={34} color={colors.accent[600]} />
          </View>
          <Txt style={{ textAlign: 'center', maxWidth: 280 }}>Tap below and point your camera at the QR code. It scans by itself.</Txt>
          <Button title="Scan QR code" icon={ScanLine} onPress={() => void openScanner()} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : permission?.granted ? (
        <View style={{ width: size, height: size, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.navy[900] }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              go(data);
            }}
          />
          {/* Aiming frame */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', width: frame, height: frame, top: (size - frame) / 2, left: (size - frame) / 2, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 20, opacity: 0.85 }}
          />
        </View>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
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
        </Card>
      )}

      {error && (
        <Txt variant="caption" color={colors.danger[600]} style={{ textAlign: 'center' }}>
          {error}
        </Txt>
      )}

      <Card style={{ gap: 12 }}>
        <Field label="Or enter the code" hint="The letters and numbers at the end of the join link, or paste the whole link.">
          <Input
            value={manual}
            onChangeText={(v) => {
              setManual(v);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. 3fe3eda314fd4e"
            accessibilityLabel="Join code"
            onSubmitEditing={() => {
              handled.current = false;
              go(manual);
            }}
          />
        </Field>
        <Button
          title="Continue"
          variant="secondary"
          disabled={!manual.trim()}
          onPress={() => {
            handled.current = false;
            go(manual);
          }}
        />
      </Card>
    </Screen>
  );
}
