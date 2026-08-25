import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Sparkles, Smartphone, KeyRound, CheckCircle2, ChefHat, Store, Clock3 } from 'lucide-react';
import { api } from '../../services/api';

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90_000;
const PRICE_KSH = 50;

type Step = 'intro' | 'phone' | 'stk_pending' | 'payment_failed' | 'payment_success' | 'access_code' | 'till' | 'till_submitted' | 'till_verified' | 'till_rejected' | 'generating' | 'generated' | 'generation_failed';

export const GeneratePlanModal: React.FC = () => {
  const { isGeneratePlanModalOpen, setIsGeneratePlanModalOpen, regenerateMealPlan, refreshAll } = useApp();

  const [step, setStep] = useState<Step>('intro');
  const [phone, setPhone] = useState('0712345678');
  const [accessCode, setAccessCode] = useState('');
  const [tillNumber, setTillNumber] = useState<string | null>(null);
  const [mpesaMessage, setMpesaMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Prefetch the Till number as soon as the modal opens, so it's already
  // visible on the intro screen's button instead of only appearing after
  // an extra click into the Till step.
  useEffect(() => {
    if (isGeneratePlanModalOpen && !tillNumber) {
      api.getTillInfo().then((res) => setTillNumber(res.tillNumber)).catch(() => {});
    }
  }, [isGeneratePlanModalOpen]);

  if (!isGeneratePlanModalOpen) return null;

  const reset = () => {
    setStep('intro');
    setError('');
    setAccessCode('');
    setMpesaMessage('');
    setIsLoading(false);
  };

  const close = () => {
    setIsGeneratePlanModalOpen(false);
    reset();
  };

  // Entitlement now exists server-side (payment confirmed or code redeemed)
  // — this is the actual generate call, which consumes it. Never assumed
  // to succeed silently: a failure here still shows the real error, since
  // the server may fail-closed for reasons the client can't predict.
  const runGeneration = async () => {
    setStep('generating');
    try {
      await regenerateMealPlan(false);
      setStep('generated');
    } catch (err: any) {
      setError(err?.message || 'Failed to generate your new plan.');
      setStep('generation_failed');
    }
  };

  // Premium/access only ever activates from the server's own recorded
  // payment status — this polls that status, it never assumes success on its
  // own. `tillGate: true` is used for the Till "Generate New Plan" path,
  // which differs from STK in two ways: (1) unlike an STK push (an instant
  // M-Pesa PIN prompt), a Till submission waits on manual admin review,
  // which can reasonably take far longer than the STK poll's 90s window —
  // timing that out would misreport a still-pending review as a failure;
  // (2) a verified Till payment issues an access CODE (delivered via
  // notification/email), not a direct entitlement the way STK/callback does
  // — so 'success' here must NOT immediately call runGeneration() the way
  // the STK path does, since no entitlement exists yet until the user
  // separately redeems that code.
  const pollPaymentStatus = (paymentId: string, opts?: { tillGate?: boolean }) => {
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const { payment } = await api.getPaymentStatus(paymentId);
        if (payment.status === 'success') {
          if (opts?.tillGate) {
            setStep('till_verified');
            refreshAll().catch(() => {}); // pick up the new access-code notification immediately
          } else {
            setStep('payment_success');
            setTimeout(runGeneration, 900);
          }
          return;
        }
        if (payment.status === 'rejected') {
          setError(payment.rejectionReason || 'Your payment could not be verified.');
          setStep('till_rejected');
          refreshAll().catch(() => {});
          return;
        }
        if (payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'expired') {
          setStep('payment_failed');
          return;
        }
        if (!opts?.tillGate && Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStep('payment_failed');
          setError('We did not receive a payment confirmation in time.');
          return;
        }
      } catch {
        if (!opts?.tillGate && Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStep('payment_failed');
          return;
        }
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await api.sendGenerationMpesaStkPush(phone);
      setStep('stk_pending');
      pollPaymentStatus(res.paymentId);
    } catch (err: any) {
      setError(err.message || 'Failed to initiate M-Pesa push');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenTill = async () => {
    setError('');
    if (tillNumber) { setStep('till'); return; }
    setIsLoading(true);
    try {
      const { tillNumber: t } = await api.getTillInfo();
      setTillNumber(t);
      setStep('till');
    } catch (err: any) {
      setError(err.message || 'Till payment is not available right now.');
    } finally {
      setIsLoading(false);
    }
  };

  // This never grants access itself — it only submits the code for an admin
  // to verify. Polls the same server-recorded status the STK path does, so
  // this screen updates live once an admin verifies or rejects it — the
  // access code itself is never returned here, only delivered via the
  // notification bell (and email, when configured).
  const handleSubmitTill = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await api.submitTillPayment('meal_plan_generation', phone, mpesaMessage);
      setStep('till_submitted');
      pollPaymentStatus(res.paymentId, { tillGate: true });
    } catch (err: any) {
      setError(err.message || 'Could not submit your payment for verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await api.redeemAccessCode(accessCode);
      await runGeneration();
    } catch (err: any) {
      // Server returns one opaque message regardless of why the code
      // failed — surfaced as-is, never elaborated on client-side.
      setError(err.message || 'Invalid or expired access code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#E8E5DD] relative animate-in zoom-in-95 duration-150">
        {step !== 'generating' && (
          <button
            onClick={close}
            className="absolute top-4 right-4 p-2 text-[#66736A] hover:text-[#17201A] rounded-full hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {step === 'intro' && (
          <div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-[#14532D]" />
              </div>
              <h3 className="text-xl font-extrabold text-[#17201A]">Generate a New Plan</h3>
              <p className="text-xs text-[#66736A] mt-1 max-w-xs mx-auto">
                Create a fresh personalized 7-day Kenyan meal plan based on your family, preferences and budget.
              </p>
              <p className="text-2xl font-black text-[#17201A] mt-4 tabular-nums">KSh {PRICE_KSH}</p>
            </div>

            <div className="space-y-2.5 mt-5">
              <button
                onClick={() => { setError(''); setStep('phone'); }}
                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                Pay KSh {PRICE_KSH} with M-Pesa
              </button>
              <button
                onClick={handleOpenTill}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#17201A] font-extrabold text-xs rounded-xl transition-all border border-[#E8E5DD] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Store className="w-4 h-4" />
                Pay via M-Pesa Till{tillNumber ? ` — ${tillNumber}` : ''}
              </button>
              <button
                onClick={() => { setError(''); setStep('access_code'); }}
                className="w-full py-3 px-4 bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#17201A] font-extrabold text-xs rounded-xl transition-all border border-[#E8E5DD] flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                Enter Access Code
              </button>
              {error && <p className="text-[11px] text-red-600 font-semibold text-center">{error}</p>}
            </div>
          </div>
        )}

        {step === 'till' && (
          <div>
            <h3 className="text-lg font-extrabold text-[#17201A] text-center">Pay via M-Pesa Till</h3>
            <p className="text-xs text-[#66736A] text-center mt-1 mb-4">KSh {PRICE_KSH} for one new weekly meal plan.</p>

            <div className="p-4 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] mb-4 space-y-1.5">
              <p className="text-[11px] font-bold text-[#17201A] uppercase">How to pay</p>
              <ol className="text-xs text-[#66736A] list-decimal list-inside space-y-0.5">
                <li>Go to M-Pesa &rarr; Lipa na M-Pesa &rarr; Buy Goods and Services</li>
                <li>Till Number: <strong className="text-[#17201A] tabular-nums">{tillNumber}</strong></li>
                <li>Amount: <strong className="text-[#17201A] tabular-nums">KSh {PRICE_KSH}</strong></li>
                <li>Enter your M-Pesa PIN and confirm</li>
                <li>Enter the code from your M-Pesa confirmation SMS below</li>
              </ol>
            </div>

            <form onSubmit={handleSubmitTill} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#17201A] block mb-1">Phone number you paid from</label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="07XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#17201A] block mb-1">M-Pesa Confirmation Message</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
                  <textarea
                    required
                    rows={3}
                    placeholder="Paste the full SMS, e.g. QGH7XYZ123 Confirmed. Ksh50.00 paid to MLO WANGU..."
                    value={mpesaMessage}
                    onChange={(e) => setMpesaMessage(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#14532D] resize-none"
                  />
                </div>
                <p className="text-[10px] text-[#66736A] mt-1">
                  Paste the whole confirmation SMS you received — we'll find the transaction code in it. This goes to an admin for review; access unlocks automatically once confirmed.
                </p>
              </div>
              {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Submitting...' : 'Submit Code for Admin Review'}
              </button>
              <button type="button" onClick={() => setStep('intro')} className="w-full text-[11px] text-[#66736A] hover:text-[#17201A] cursor-pointer">
                Back
              </button>
            </form>
          </div>
        )}

        {step === 'till_submitted' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto animate-pulse">
              <Clock3 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Submitted for verification</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              An admin will review your payment and issue your access code — this screen will update automatically. You can also close this and check the notification bell later.
            </p>
            <button
              onClick={close}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {step === 'till_verified' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Payment verified!</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              Your access code is ready — check the notification bell (top of the app) for it, then come back here and choose "Enter Access Code".
            </p>
            <button
              onClick={() => { setError(''); setStep('access_code'); }}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Enter Access Code Now
            </button>
            <button onClick={close} className="w-full text-[11px] text-[#66736A] hover:text-[#17201A] cursor-pointer">
              I'll do this later
            </button>
          </div>
        )}

        {step === 'till_rejected' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <X className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Payment could not be verified</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">{error || 'Please check your M-Pesa code and try again, or contact support.'}</p>
            <button
              onClick={() => { setError(''); setStep('intro'); }}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {step === 'phone' && (
          <div>
            <h3 className="text-lg font-extrabold text-[#17201A] text-center">Pay with M-Pesa</h3>
            <p className="text-xs text-[#66736A] text-center mt-1 mb-5">KSh {PRICE_KSH} for one new weekly meal plan.</p>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#17201A] block mb-1">M-Pesa Phone Number</label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="07XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
              </div>
              {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Initiating M-Pesa...' : `PAY WITH M-PESA — KSh ${PRICE_KSH}`}
              </button>
              <button type="button" onClick={() => setStep('intro')} className="w-full text-[11px] text-[#66736A] hover:text-[#17201A] cursor-pointer">
                Back
              </button>
            </form>
          </div>
        )}

        {step === 'stk_pending' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto animate-pulse">
              <Smartphone className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-[#17201A]">Check your phone</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              We sent a prompt to <strong>{phone}</strong> to authorize the payment of <strong>KSh {PRICE_KSH}</strong>.
            </p>
            <div className="p-3 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] text-[11px] text-[#66736A]">
              Waiting for payment...
            </div>
          </div>
        )}

        {step === 'payment_success' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Payment successful</h3>
          </div>
        )}

        {step === 'access_code' && (
          <div>
            <h3 className="text-lg font-extrabold text-[#17201A] text-center">Enter Access Code</h3>
            <p className="text-xs text-[#66736A] text-center mt-1 mb-5">Skip the KSh {PRICE_KSH} payment with a valid access code.</p>
            <form onSubmit={handleRedeemCode} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#17201A] block mb-1">Access Code</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    autoCapitalize="characters"
                    placeholder="Enter code"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                  />
                </div>
              </div>
              {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Checking...' : 'Redeem Code'}
              </button>
              <button type="button" onClick={() => setStep('intro')} className="w-full text-[11px] text-[#66736A] hover:text-[#17201A] cursor-pointer">
                Back
              </button>
            </form>
          </div>
        )}

        {step === 'generating' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#14532D]/10 text-[#14532D] flex items-center justify-center mx-auto animate-pulse">
              <ChefHat className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-[#17201A]">Creating your new plan...</h3>
          </div>
        )}

        {step === 'generated' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Your new weekly plan is ready.</h3>
            <button
              onClick={close}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              View My Plan
            </button>
          </div>
        )}

        {step === 'payment_failed' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <X className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Payment was not completed.</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">No charge was made and no plan was generated. You can try again.</p>
            <button
              onClick={() => setStep('intro')}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {step === 'generation_failed' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <X className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Could not generate your plan.</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">{error || 'Something went wrong. Please try again.'}</p>
            <button
              onClick={close}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
