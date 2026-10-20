import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { IndianRupee } from 'lucide-react-native';
import { formatINR, type BusinessDetails } from '@pg/shared';
import { Button, Txt } from './ui';

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

/**
 * Pay button for a bill. This only opens the resident's UPI app. Online
 * payments are not verified by PG Sathi yet, so the payment appears here
 * after the PG records it — the app never marks anything as paid itself.
 */
export function PayRentButton({ business, amountPaise, note }: { business: BusinessDetails | null | undefined; amountPaise: number; note: string }) {
  const [opening, setOpening] = useState(false);
  if (amountPaise <= 0) return null;
  if (!business?.upi_id) {
    return (
      <Txt variant="caption" style={{ textAlign: 'center' }}>
        Pay {formatINR(amountPaise)} to your PG by cash or bank transfer. It will show here once they record it.
      </Txt>
    );
  }
  const upiId = business.upi_id;
  return (
    <View style={{ gap: 8 }}>
      <Button
        title={`Pay ${formatINR(amountPaise)} via UPI`}
        variant="accent"
        icon={IndianRupee}
        loading={opening}
        onPress={async () => {
          setOpening(true);
          try {
            await Linking.openURL(upiPayUrl({ upiId, payeeName: business.name, amountPaise, note }));
          } catch {
            Alert.alert('No UPI app found', `Pay ${formatINR(amountPaise)} to UPI ID ${upiId} from any UPI app.`);
          } finally {
            setOpening(false);
          }
        }}
      />
      <Txt variant="caption" style={{ textAlign: 'center' }}>
        Pays {business.name} ({upiId}). After paying, it shows as paid once your PG records it.
      </Txt>
    </View>
  );
}
