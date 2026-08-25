import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Plus, DollarSign, Calendar, AlertCircle } from 'lucide-react';
import { ExpenseCategory } from '../../types';

export const LogExpenseModal: React.FC = () => {
  const { isLogExpenseModalOpen, setIsLogExpenseModalOpen, logExpense } = useApp();

  const [amountKsh, setAmountKsh] = useState('');
  // Must match the canonical ExpenseCategory casing exactly — budget
  // categories and expense categories are compared by exact string, so a
  // lowercase value here would silently create a separate phantom category
  // instead of reducing the real one's remaining balance.
  const [category, setCategory] = useState<ExpenseCategory>('Food');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isLogExpenseModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountKsh);
    if (!amount || amount <= 0) {
      setError('Please enter a valid expense amount');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a short description');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await logExpense({
        amountKsh: amount,
        category,
        description: description.trim(),
        date,
      });
      setAmountKsh('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to log expense');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8E5DD] relative animate-in zoom-in-95 duration-150">
        <button
          onClick={() => setIsLogExpenseModalOpen(false)}
          className="absolute top-4 right-4 p-2 text-[#66736A] hover:text-[#17201A] rounded-full hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h3 className="text-lg font-extrabold text-[#17201A]">Log Household Expense</h3>
          <p className="text-xs text-[#66736A] mt-0.5">
            Quickly record a purchase to keep your private budget velocity accurate.
          </p>
        </div>

        {error && (
          <div className="mt-3 p-2 bg-red-50 text-red-800 rounded-xl text-xs flex items-center gap-1.5 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-[#17201A] block mb-1">Amount (KSh)</label>
            <input
              type="number"
              required
              min="1"
              placeholder="e.g. 450"
              value={amountKsh}
              onChange={(e) => setAmountKsh(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-base font-extrabold text-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#14532D]"
              autoFocus
            />
          </div>

          <div>
            <label className="font-bold text-[#17201A] block mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl font-semibold focus:outline-none"
            >
              <option value="Food">Food & Groceries (Sukuma, Unga, Meat)</option>
              <option value="Rent">Rent & Housing</option>
              <option value="Transport">Transport (Matatu, Fuel, Boda)</option>
              <option value="Bills">Utilities & Bills (KPLC Tokens, Water, Internet)</option>
              <option value="Shopping">Shopping</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Health">Health</option>
              <option value="Savings">Savings & Chama (Sacco, M-Shwari)</option>
              <option value="Debt">Debt / Loan Repayment</option>
              <option value="Other">Other / Miscellaneous</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-[#17201A] block mb-1">Description</label>
            <input
              type="text"
              required
              placeholder="e.g. Vegetable market shopping (Marikiti)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
          </div>

          <div>
            <label className="font-bold text-[#17201A] block mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-[#172554] text-white font-extrabold text-xs rounded-xl hover:bg-[#1e3a8a] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4 text-[#F4B942]" />
            {isLoading ? 'Saving...' : 'Record Expense'}
          </button>
        </form>
      </div>
    </div>
  );
};
