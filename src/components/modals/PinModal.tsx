import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, Unlock, Shield, X, AlertCircle, KeyRound, Sparkles } from 'lucide-react';

export const PinModal: React.FC = () => {
  const { isPinModalOpen, setIsPinModalOpen, unlockBudget, triggerConfetti } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isPinModalOpen) {
      setPin('');
      setError('');
    }
  }, [isPinModalOpen]);

  if (!isPinModalOpen) return null;

  const handleNumpadClick = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      setError('');
      if (next.length === 4) {
        // Auto-submit after 4 digits for fast mobile usage
        handleSubmit(next);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleSubmit = async (pinToVerify?: string) => {
    const finalPin = pinToVerify || pin;
    if (finalPin.length < 4) {
      setError('Please enter a 4 to 6 digit PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await unlockBudget(finalPin);
      if (success) {
        triggerConfetti();
      } else {
        setError('Incorrect PIN. (Default demo PIN is 1234)');
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN. (Default demo PIN is 1234)');
    } finally {
      setIsLoading(false);
    }
  };

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
            <Lock className="w-7 h-7 text-[#F4B942]" />
          </div>
          <h3 className="text-xl font-extrabold text-white">Unlock Private Budget</h3>
          <p className="text-xs text-blue-200 mt-1">
            Enter your 4-6 digit PIN to access your household finances.
          </p>
        </div>

        {/* PIN Indicators Dots */}
        <div className="flex items-center justify-center gap-3 my-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                pin.length > idx
                  ? 'bg-[#F4B942] border-[#F4B942] scale-110'
                  : 'bg-white/10 border-white/30'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-2.5 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-xs flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Mobile-Friendly Custom Numpad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleNumpadClick(digit)}
              disabled={isLoading}
              className="py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-extrabold text-lg border border-white/10 transition-all cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            className="py-3.5 rounded-2xl bg-white/5 hover:bg-white/15 text-blue-200 font-semibold text-xs border border-white/10 transition-all cursor-pointer flex items-center justify-center"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleNumpadClick('0')}
            disabled={isLoading}
            className="py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-extrabold text-lg border border-white/10 transition-all cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading || pin.length < 4}
            className="py-3.5 rounded-2xl bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm transition-all cursor-pointer flex items-center justify-center disabled:opacity-40"
          >
            <Unlock className="w-4 h-4" />
          </button>
        </div>

        {/* Demo Pin Helper */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <p className="text-[11px] text-blue-300">
            Demo Budget PIN: <span className="font-mono font-extrabold text-[#F4B942]">1234</span>
          </p>
        </div>
      </div>
    </div>
  );
};
