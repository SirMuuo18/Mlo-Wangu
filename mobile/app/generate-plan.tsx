// The "Generate New Plan" gate — Till (Buy Goods) manual payment + access-
// code redemption, mirroring src/components/modals/GeneratePlanModal.tsx's
// actual live flow (STK push is disabled there too, "while the Daraja app
// is pending" — not a mobile-specific gap). Every state transition below
// is driven by a real server response:
//   - submitting a Till code creates a 'pending' payment — never assumed
//     verified;
//   - polling GET /api/payments/:id is the ONLY thing that can move this
//     screen to "verified"/"rejected" — never a local timer or guess;
//   - the access code itself is never returned by the verify step (it's
//     delivered via the existing notification, exactly like web) — this
//     screen sends the user to Notifications to retrieve it, then back
//     here to redeem it;
//   - redeeming a code and generating the plan are two real, separate
//     server calls, in that order, and this screen never marks either one
//     "done" without their own 200.
import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthGuard } from '../components/AuthGuard';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { api, ApiError } from '../lib/api';
import { useGenerateMealPlan } from '../hooks/useMealPlan';
import { colors, radius, spacing } from '../constants/theme';

const PRICE_KSH = 50;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90_000;

type Step =
  | 'intro' | 'till' | 'till_submitted' | 'till_verified' | 'till_rejected'
  | 'access_code' | 'generating' | 'generated' | 'generation_failed';

function GeneratePlanContent() {
  const generateMealPlan = useGenerateMealPlan();
  const [step, setStep] = useState<Step>('intro');
  const [tillNumber, setTillNumber] = useState<string | null>(null);
  const [phone, setPhone] = useState('0712345678');
  const [mpesaMessage, setMpesaMessage] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Server-computed only (payment.isStale) — presentation only, see Phase 3B item 14.
  const [isStalePending, setIsStalePending] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    api.getTillInfo().then((res) => setTillNumber(res.tillNumber)).catch(() => {});
    return () => { cancelledRef.current = true; };
  }, []);

  const runGeneration = async () => {
    setStep('generating');
    try {
      await generateMealPlan.mutateAsync();
      if (!cancelledRef.current) setStep('generated');
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to generate your new plan.');
      setStep('generation_failed');
    }
  };

  // Polls the server's own recorded payment status — never assumes success.
  // tillGate: a verified Till payment issues an access CODE (delivered via
  // notification), not a direct entitlement — so success here routes to
  // redemption, it never calls runGeneration() itself.
  const pollPaymentStatus = (paymentId: string) => {
    const startedAt = Date.now();
    const poll = async () => {
      if (cancelledRef.current) return;
      try {
        const { payment } = await api.getPaymentStatus(paymentId);
        if (payment.status === 'success') { setStep('till_verified'); return; }
        if (payment.status === 'rejected') {
          setError(payment.rejectionReason || 'Your payment could not be verified.');
          setStep('till_rejected');
          return;
        }
        if (payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'expired') {
          setError('Payment was not completed.');
          setStep('till_rejected');
          return;
        }
        setIsStalePending(payment.isStale);
      } catch {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) return; // give up quietly; user can check Notifications later
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  };

  const handleSubmitTill = async () => {
    if (!mpesaMessage.trim()) {
      setError('Paste your M-Pesa confirmation message.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await api.submitTillPayment('meal_plan_generation', phone, mpesaMessage.trim());
      setStep('till_submitted');
      pollPaymentStatus(res.paymentId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your payment for verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!code.trim()) {
      setError('Enter an access code.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await api.redeemAccessCode(code.trim());
      await runGeneration();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate your plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen scroll>
      {step === 'intro' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="restaurant" size={28} color={colors.forest} /></View>
          <AppText variant="heading" style={styles.title}>Generate a New Plan</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>
            A fresh 7-day Kenyan meal plan costs a one-time KSh {PRICE_KSH}.
          </AppText>
          <Button
            label={`Pay via M-Pesa Till${tillNumber ? ` — ${tillNumber}` : ''}`}
            onPress={() => { setError(null); setStep('till'); }}
            style={styles.tillButton}
          />
          <Button label="Enter Access Code" variant="secondary" onPress={() => { setError(null); setStep('access_code'); }} />
        </View>
      )}

      {step === 'till' && (
        <View>
          <AppText variant="heading" style={styles.title}>Pay via M-Pesa Till</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>KSh {PRICE_KSH} for one new weekly meal plan.</AppText>
          <View style={styles.instructionsCard}>
            <AppText variant="caption" color={colors.ink}>1. M-Pesa → Lipa na M-Pesa → Buy Goods and Services</AppText>
            <AppText variant="caption" color={colors.ink}>2. Till Number: {tillNumber || '…'}</AppText>
            <AppText variant="caption" color={colors.ink}>3. Amount: KSh {PRICE_KSH}</AppText>
            <AppText variant="caption" color={colors.ink}>4. Enter your M-Pesa PIN and confirm</AppText>
            <AppText variant="caption" color={colors.ink}>5. Paste the confirmation SMS below</AppText>
          </View>
          <TextField label="Phone number you paid from" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField
            label="M-Pesa Confirmation Message"
            value={mpesaMessage}
            onChangeText={setMpesaMessage}
            multiline
            numberOfLines={3}
            placeholder="Paste the full SMS here"
          />
          {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}
          <Button label="Submit for Admin Review" onPress={handleSubmitTill} loading={isLoading} />
          <Button label="Back" variant="ghost" onPress={() => setStep('intro')} />
        </View>
      )}

      {step === 'till_submitted' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="time" size={28} color={colors.gold} /></View>
          <AppText variant="heading" style={styles.title}>
            {isStalePending ? 'Still awaiting review' : 'Submitted for verification'}
          </AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>
            {isStalePending
              ? "This payment has been pending review longer than usual. It hasn't been rejected — please contact support if you don't hear back soon."
              : 'An admin will review your payment and issue your access code. This screen updates automatically — you can also close it and check Notifications later.'}
          </AppText>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      )}

      {step === 'till_verified' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="checkmark-circle" size={28} color={colors.forest} /></View>
          <AppText variant="heading" style={styles.title}>Payment verified!</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>
            Your access code is ready — check Notifications for it, then come back and enter it below.
          </AppText>
          <Button label="Enter Access Code Now" onPress={() => { setError(null); setStep('access_code'); }} />
          <Button label="I'll do this later" variant="ghost" onPress={() => router.back()} />
        </View>
      )}

      {step === 'till_rejected' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="close-circle" size={28} color={colors.danger} /></View>
          <AppText variant="heading" style={styles.title}>Payment could not be verified</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>{error || 'Please check your M-Pesa code and try again.'}</AppText>
          <Button label="Try Again" onPress={() => { setError(null); setStep('intro'); }} />
        </View>
      )}

      {step === 'access_code' && (
        <View>
          <AppText variant="heading" style={styles.title}>Enter Access Code</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>Skip the KSh {PRICE_KSH} payment with a valid access code.</AppText>
          <TextField label="Access Code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Enter your code" />
          {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}
          <Button label="Redeem & Generate" onPress={handleRedeem} loading={isLoading} />
          <Button label="Back" variant="ghost" onPress={() => setStep('intro')} />
        </View>
      )}

      {step === 'generating' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="restaurant" size={28} color={colors.forest} /></View>
          <AppText variant="heading" style={styles.title}>Creating your new plan…</AppText>
        </View>
      )}

      {step === 'generated' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="checkmark-circle" size={28} color={colors.forest} /></View>
          <AppText variant="heading" style={styles.title}>Your new weekly plan is ready.</AppText>
          <Button label="View My Plan" onPress={() => router.back()} />
        </View>
      )}

      {step === 'generation_failed' && (
        <View style={styles.center}>
          <View style={styles.iconWrap}><Ionicons name="close-circle" size={28} color={colors.danger} /></View>
          <AppText variant="heading" style={styles.title}>Could not generate your plan.</AppText>
          <AppText variant="body" color={colors.moss} style={styles.body}>{error || 'Something went wrong. Please try again.'}</AppText>
          <Button label="Close" onPress={() => router.back()} />
        </View>
      )}
    </Screen>
  );
}

export default function GeneratePlanScreen() {
  return (
    <AuthGuard>
      <GeneratePlanContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', padding: spacing.md },
  iconWrap: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { marginBottom: spacing.sm, textAlign: 'center' },
  body: { marginBottom: spacing.lg, textAlign: 'center' },
  tillButton: { marginBottom: spacing.sm, alignSelf: 'stretch' },
  instructionsCard: { backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
  error: { marginBottom: spacing.md },
});
