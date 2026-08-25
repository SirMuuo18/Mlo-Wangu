import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Check, Phone, ShieldCheck, Smartphone, Store, KeyRound, Clock3 } from 'lucide-react';
import { api } from '../../services/api';

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90_000;

export const PremiumPaywallModal: React.FC = () => {
  const { isPremiumModalOpen, setIsPremiumModalOpen, user, refreshAll, triggerConfetti } = useApp();

  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'monthly'>('weekly');
  const [phone, setPhone] = useState('0712345678');
  const [mpesaMessage, setMpesaMessage] = useState('');
  const [tillNumber, setTillNumber] = useState<string | null>(null);
  const [step, setStep] = useState<'plan' | 'stk_pending' | 'success' | 'failed' | 'till' | 'till_submitted'>('plan');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Prefetch the Till number as soon as the modal opens, so it's already
  // visible on the plan screen's button instead of only appearing after an
  // extra click into the Till step.
  useEffect(() => {
    if (isPremiumModalOpen && !tillNumber) {
      api.getTillInfo().then((res) => setTillNumber(res.tillNumber)).catch(() => {});
    }
  }, [isPremiumModalOpen]);

  if (!isPremiumModalOpen) return null;

  // Premium only ever activates on the server, from the real Daraja callback.
  // This polls the server's own recorded payment status — it never assumes
  // success on its own.
  const pollPaymentStatus = (paymentId: string, opts?: { noTimeout?: boolean }) => {
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const { payment } = await api.getPaymentStatus(paymentId);
        if (payment.status === 'success') {
          setStep('success');
          await refreshAll();
          triggerConfetti();
          return;
        }
        if (payment.status === 'failed' || payment.status === 'cancelled' || payment.status === 'expired') {
          setStep('failed');
          return;
        }
        if (!opts?.noTimeout && Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStep('failed');
          return;
        }
      } catch {
        if (!opts?.noTimeout && Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStep('failed');
          return;
        }
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  };

  // Currently unused — its only call site (the STK "PAY WITH M-PESA" form)
  // is hidden below while the Daraja app is pending. Kept intact so STK can
  // be re-enabled later without rebuilding this handler.
  const handleTriggerMpesa = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await api.sendMpesaStkPush(phone, selectedPlan);
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

  // Never activates Premium itself — only submits the message for an admin
  // to verify. Once confirmed, the same poll used for the STK path picks it
  // up and refreshes the user's own Premium status immediately — no manual
  // reload needed. No fixed timeout here: an admin review can reasonably
  // take longer than an instant STK push, so this polls indefinitely while
  // the modal is open rather than giving up after 90s.
  const handleSubmitTill = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await api.submitTillPayment(selectedPlan, phone, mpesaMessage);
      setStep('till_submitted');
      pollPaymentStatus(res.paymentId, { noTimeout: true });
    } catch (err: any) {
      setError(err.message || 'Could not submit your payment for verification.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#E8E5DD] relative animate-in zoom-in-95 duration-150">
        <button
          onClick={() => setIsPremiumModalOpen(false)}
          className="absolute top-4 right-4 p-2 text-[#66736A] hover:text-[#17201A] rounded-full hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'plan' && (
          <div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6 text-[#14532D]" />
              </div>
              <h3 className="text-xl font-extrabold text-[#17201A]">Eat Better. Spend Smarter.</h3>
              <p className="text-xs text-[#66736A] mt-1">
                Unlock advanced Kenyan grocery optimization, unlimited smart swaps, and budget projections.
              </p>
            </div>

            {/* Plan Selector */}
            <div className="grid grid-cols-2 gap-3 my-5">
              <div
                onClick={() => setSelectedPlan('weekly')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                  selectedPlan === 'weekly'
                    ? 'border-[#14532D] bg-[#FAF8F2]'
                    : 'border-[#E8E5DD] bg-white hover:border-gray-300'
                }`}
              >
                <span className="text-[10px] font-extrabold uppercase text-[#14532D]">Weekly Plan</span>
                <p className="text-xl font-black text-[#17201A] mt-1 tabular-nums">KSh 50</p>
                <span className="text-[11px] text-[#66736A]">per week</span>
              </div>

              <div
                onClick={() => setSelectedPlan('monthly')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-center relative ${
                  selectedPlan === 'monthly'
                    ? 'border-[#14532D] bg-[#FAF8F2]'
                    : 'border-[#E8E5DD] bg-white hover:border-gray-300'
                }`}
              >
                <span className="absolute -top-2.5 right-3 bg-[#F4B942] text-[#17201A] text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  Best Value
                </span>
                <span className="text-[10px] font-extrabold uppercase text-[#14532D]">Monthly Plan</span>
                <p className="text-xl font-black text-[#17201A] mt-1 tabular-nums">KSh 150</p>
                <span className="text-[11px] text-[#66736A]">Save 25%</span>
              </div>
            </div>

            {/* Features List */}
            <div className="space-y-2 text-xs text-[#17201A] mb-5">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#2E7D32]" />
                <span>Personalized Gemini AI Kenyan nutrition coaching</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#2E7D32]" />
                <span>Automatic grocery price optimizer for local markets</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#2E7D32]" />
                <span>Overspending velocity alerts & month-end projection</span>
              </div>
            </div>

            {/* STK Push is temporarily hidden while the Daraja app is
                pending — Till/Paybill is the only live payment path for
                now. Re-add the phone-number form + "PAY WITH M-PESA" STK
                button here once Daraja is confirmed working. */}
            <div className="space-y-3">
              {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              <button
                type="button"
                onClick={handleOpenTill}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Store className="w-4 h-4" />
                Pay via M-Pesa Till{tillNumber ? ` — ${tillNumber}` : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'till' && (
          <div>
            <h3 className="text-lg font-extrabold text-[#17201A] text-center">Pay via M-Pesa Till</h3>
            <p className="text-xs text-[#66736A] text-center mt-1 mb-4">
              KSh {selectedPlan === 'weekly' ? 50 : 150} for the {selectedPlan} Premium plan.
            </p>

            <div className="p-4 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] mb-4 space-y-1.5">
              <p className="text-[11px] font-bold text-[#17201A] uppercase">How to pay</p>
              <ol className="text-xs text-[#66736A] list-decimal list-inside space-y-0.5">
                <li>Go to M-Pesa &rarr; Lipa na M-Pesa &rarr; Buy Goods and Services</li>
                <li>Till Number: <strong className="text-[#17201A] tabular-nums">{tillNumber}</strong></li>
                <li>Amount: <strong className="text-[#17201A] tabular-nums">KSh {selectedPlan === 'weekly' ? 50 : 150}</strong></li>
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
                  Paste the whole confirmation SMS you received — we'll find the transaction code in it. This goes to an admin for review; Premium activates automatically once confirmed.
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
              <button type="button" onClick={() => setStep('plan')} className="w-full text-[11px] text-[#66736A] hover:text-[#17201A] cursor-pointer">
                Back
              </button>
            </form>
          </div>
        )}

        {step === 'till_submitted' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
              <Clock3 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-[#17201A]">Submitted for verification</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              We'll confirm your payment shortly. Premium activates automatically once confirmed — no need to do anything else.
            </p>
            <button
              onClick={() => setIsPremiumModalOpen(false)}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22] cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {step === 'stk_pending' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto animate-pulse">
              <Smartphone className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-extrabold text-[#17201A]">Check your phone and enter your M-Pesa PIN.</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              We sent a prompt to <strong>{phone}</strong> to authorize the payment of{' '}
              <strong>KSh {selectedPlan === 'weekly' ? 50 : 150}</strong>.
            </p>

            <div className="p-3 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] text-[11px] text-[#66736A]">
              Payment processing...
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-[#17201A]">Payment successful 🎉</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              Premium is now active. All premium AI and grocery features are unlocked.
            </p>
            {user?.premiumExpiry && (
              <p className="text-[11px] text-[#66736A]">
                Valid until <strong>{new Date(user.premiumExpiry).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </p>
            )}

            <button
              onClick={() => setIsPremiumModalOpen(false)}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22]"
            >
              Start Exploring Premium
            </button>
          </div>
        )}

        {step === 'failed' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <X className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-[#17201A]">Payment was not completed.</h3>
            <p className="text-xs text-[#66736A] max-w-xs mx-auto">
              No charge was made and Premium was not activated. You can try again.
            </p>

            <button
              onClick={() => setStep('plan')}
              className="w-full py-3 px-4 bg-[#14532D] text-white font-extrabold text-xs rounded-xl hover:bg-[#0f3e22]"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
