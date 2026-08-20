import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, Unlock, X, AlertCircle, Timer } from 'lucide-react';

export const PinModal: React.FC = () => {
  const { isPinModalOpen, setIsPinModalOpen, unlockBudget, triggerConfetti } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  useEffect(() => {
    if (isPinModalOpen) {
      setPin('');
      setError('');
      setLockedSeconds(0);
    }
  }, [isPinModalOpen]);

  // Countdown timer for lockout display
  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const t = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockedSeconds]);

  if (!isPinModalOpen) return null;

  const isLocked = lockedSeconds > 0;

  const handleNumpadClick = (digit: string) => {
    if (pin.length >= 6 || isLocked) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 6) {
      handleSubmit(next);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleSubmit = async (pinToVerify?: string) => {
    const finalPin = pinToVerify || pin;
    if (finalPin.length < 6) {
      setError('Please enter your 6-digit Budget PIN.');
      return;
    }
    if (isLocked) return;

    setIsLoading(true);
    setError('');

    try {
      const success = await unlockBudget(finalPin);
      if (success) {
        triggerConfetti();
      } else {
        setPin('');
        setError('Incorrect PIN. Please try again.');
      }
    } catch (err: any) {
      setPin('');
      // Server returns lockedUntilSeconds on lockout (429)
      if (err.status === 429 && err.message) {
        setLockedSeconds(60); // conservative display; server enforces the real timer
        setError(err.message);
      } else {
        setError(err.message || 'Incorrect PIN. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const minutesLeft = Math.ceil(lockedSeconds / 60);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#172554] text-white rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl border border-[#1e3a8a] relative animate-in zoom-in-95 duration-150">
        <button
          onClick={() => setIsPinModalOpen(false)}
          className="absolute top-4 right-4 p-2 text-blue-300 hover:text-white rounded-full hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3">
            {isLocked ? <Timer className="w-7 h-7 text-red-400" /> : <Lock className="w-7 h-7 text-[#F4B942]" />}
          </div>
          <h3 className="text-xl font-extrabold text-white">Unlock Private Budget</h3>
          <p className="text-xs text-blue-200 mt-1">
            Enter your 6-digit Budget PIN to access your household finances.
          </p>
        </div>

        {/* PIN indicator dots (6 digits) */}
        <div className="flex items-center justify-center gap-2.5 my-6">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                pin.length > idx
                  ? 'bg-[#F4B942] border-[#F4B942] scale-110'
                  : 'bg-white/10 border-white/30'
              }`}
            />
          ))}
        </div>

        {/* Error / lockout message */}
        {error && (
          <div className="mb-4 p-2.5 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}{isLocked ? ` (${minutesLeft} min remaining)` : ''}</span>
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleNumpadClick(digit)}
              disabled={isLoading || isLocked}
              className="py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-extrabold text-lg border border-white/10 transition-all cursor-pointer disabled:opacity-40"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLocked}
            className="py-3.5 rounded-2xl bg-white/5 hover:bg-white/15 text-blue-200 font-semibold text-xs border border-white/10 transition-all cursor-pointer flex items-center justify-center"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleNumpadClick('0')}
            disabled={isLoading || isLocked}
            className="py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-lg border border-white/10 transition-all cursor-pointer disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading || pin.length < 6 || isLocked}
            className="py-3.5 rounded-2xl bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm transition-all cursor-pointer flex items-center justify-center disabled:opacity-40"
          >
            <Unlock className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <p className="text-[11px] text-blue-300/60">
            Your Budget PIN is private and known only to you.
          </p>
        </div>
      </div>
    </div>
  );
};
