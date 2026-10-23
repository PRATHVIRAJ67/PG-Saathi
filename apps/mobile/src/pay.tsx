import { useMemo, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import { IndianRupee, QrCode, Zap } from 'lucide-react-native';
import { colors } from '@pg/design-tokens';
import { toAppError } from '@pg/api-client';
import { queryKeys, useBackend, useOnlinePaymentsAvailable } from '@pg/api-client/react';
import { formatINR, type BusinessDetails } from '@pg/shared';
import { Button, Card, Txt } from './ui';

/**
 * Standard UPI deep link (NPCI spec). Opens GPay / PhonePe / Paytm / BHIM with
 * the PG's UPI ID and the exact amount filled in. Amount uses integer paise
 * maths so it is never rounded wrongly.
 */
export function upiPayUrl({ upiId, payeeName, amountPaise, note }: { upiId: string; payeeName: string; amountPaise: number; note: string }) {
  const amount = `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, '0')}`;
  // encodeURIComponent (not URLSearchParams): some UPI apps show "+" literally for spaces.
  const params: [string, string][] = [['pa', upiId], ['pn', payeeName], ['am', amount], ['cu', 'INR'], ['tn', note]];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** QR code drawn with react-native-svg, so another phone (a parent, a friend) can scan and pay. */
function UpiQr({ value, size = 200 }: { value: string; size?: number }) {
  const { d, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    return { d: path, count: n };
  }, [value]);
  const quiet = 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} accessibilityLabel="UPI QR code">
      <Rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill={colors.white} />
      <Path d={d} fill={colors.navy[900]} />
    </Svg>
  );
}

/**
 * Ways to pay a bill:
 *  - Pay online: the PG's own Razorpay account. The payments service verifies
 *    the payment with Razorpay and records it; the bill updates by itself.
 *  - UPI app / QR: straight to the PG's UPI ID. Shows as paid once the PG records it.
 * The app never marks anything as paid itself.
 */
export function PayRentButton({
  business,
  tenantId,
  invoiceId,
  invoiceBalancePaise,
  amountPaise,
  note,
}: {
  business: BusinessDetails | null | undefined;
  tenantId: string | null | undefined;
  /** The bill "Pay online" pays (the oldest open one on Home). */
  invoiceId: string | null | undefined;
  invoiceBalancePaise: number;
  /** Amount for the UPI app/QR (on Home this is everything due). */
  amountPaise: number;
  note: string;
}) {
  const { onlinePayments } = useBackend();
  const queryClient = useQueryClient();
  const service = onlinePayments?.available ? onlinePayments : null;
  const online = useOnlinePaymentsAvailable(service ? tenantId : null);
  const [paying, setPaying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showQr, setShowQr] = useState(false);
  if (amountPaise <= 0) return null;

  const canPayOnline = !!service && !!invoiceId && invoiceBalancePaise > 0 && online.data === true;
  const upiId = business?.upi_id ?? null;

  const payOnline = async () => {
    if (!service || !invoiceId) return;
    setPaying(true);
    try {
      const returnUrl = ExpoLinking.createURL(`bill/${invoiceId}`);
      const { checkoutUrl } = await service.startCheckout(invoiceId, returnUrl);
      await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);
    } catch (error) {
      Alert.alert('Could not start the payment', toAppError(error).message);
    } finally {
      setPaying(false);
      // Whatever happened in the browser, show the bill as the server now sees it.
      if (tenantId) await queryClient.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
    }
  };

  const openUpi = async () => {
    if (!upiId || !business) return;
    setOpening(true);
    try {
      await Linking.openURL(upiPayUrl({ upiId, payeeName: business.name, amountPaise, note }));
    } catch {
      Alert.alert('No UPI app found', `Pay ${formatINR(amountPaise)} to UPI ID ${upiId} from any UPI app.`);
    } finally {
      setOpening(false);
    }
  };

  if (!canPayOnline && !upiId) {
    return (
      <Txt variant="caption" style={{ textAlign: 'center' }}>
        Pay {formatINR(amountPaise)} to your PG by cash or bank transfer. It will show here once they record it.
      </Txt>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {canPayOnline && (
        <>
          <Button title={`Pay ${formatINR(invoiceBalancePaise)} online`} variant="accent" icon={Zap} loading={paying} onPress={() => void payOnline()} />
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            UPI, card or netbanking through Razorpay. Your bill updates as soon as the payment goes through.
          </Txt>
        </>
      )}
      {upiId && business && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              title={canPayOnline ? 'Pay with UPI app' : `Pay ${formatINR(amountPaise)} via UPI`}
              variant={canPayOnline ? 'secondary' : 'accent'}
              icon={IndianRupee}
              loading={opening}
              onPress={() => void openUpi()}
              style={{ flex: 1 }}
            />
            <Button title={showQr ? 'Hide QR' : 'QR'} variant="secondary" icon={QrCode} onPress={() => setShowQr((v) => !v)} />
          </View>
          {showQr && (
            <Card style={{ alignItems: 'center', gap: 8 }}>
              <UpiQr value={upiPayUrl({ upiId, payeeName: business.name, amountPaise, note })} />
              <Txt variant="label">{formatINR(amountPaise)} to {business.name}</Txt>
              <Txt variant="caption">{upiId}</Txt>
            </Card>
          )}
          <Txt variant="caption" style={{ textAlign: 'center' }}>
            UPI pays {business.name} ({upiId}) directly. It shows as paid once your PG records it.
          </Txt>
        </>
      )}
    </View>
  );
}
