import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Shield, KeyRound, X, AlertCircle, Check } from 'lucide-react';

export const PinSetupModal: React.FC = () => {
  const { isPinSetupModalOpen, setIsPinSetupModalOpen, setupBudgetPin } = useApp();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isPinSetupModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPin)) {
      setError('PIN must be exactly 6 numeric digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match. Please try again.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await setupBudgetPin(newPin, confirmPin);
      setIsPinSetupModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#172554] text-white rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl border border-[#1e3a8a] relative animate-in zoom-in-95 duration-150">
        <button
          onClick={() => setIsPinSetupModalOpen(false)}
          className="absolute top-4 right-4 p-2 text-blue-300 hover:text-white rounded-full hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6 text-[#F4B942]" />
          </div>
          <h3 className="text-xl font-extrabold text-white">Create Your Budget PIN</h3>
          <p className="text-xs text-blue-200 mt-1">
            Choose a private 6-digit numeric PIN to protect your household salary and financial records.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-2.5 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          <div>
            <label className="font-bold text-blue-200 block mb-1">6-Digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              required
              placeholder="6 digits"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
            />
          </div>

          <div>
            <label className="font-bold text-blue-200 block mb-1">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || newPin.length < 6 || confirmPin.length < 6}
            className="w-full py-3.5 px-4 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {isLoading ? 'Encrypting & Saving...' : 'Save & Protect Budget'}
          </button>
        </form>
      </div>
    </div>
  );
};
