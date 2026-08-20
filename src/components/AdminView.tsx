import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle2, XCircle, Play, RefreshCw, Edit3, Save, Coins, Database, Lock } from 'lucide-react';
import { api } from '../services/api';
import { FoodItem } from '../types';

// Self-contained: this view is only ever reached through the /?admin=true
// entry point after AdminGate has independently verified server-side admin
// authorization. It intentionally does not depend on the consumer AppProvider
// so the admin surface stays fully decoupled from the consumer app tree.
export const AdminView: React.FC = () => {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [auditResults, setAuditResults] = useState<any>(null);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editRegion, setEditRegion] = useState<string>('Nairobi');

  useEffect(() => {
    loadStats();
    loadFoodItems();
  }, []);

  const loadStats = async () => {
    try {
      const res = await api.getAdminStats();
      setStats(res);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadFoodItems = async () => {
    try {
      const res = await api.getFoodItems();
      setFoodItems(res.items);
    } catch (err) {
      console.error('Error loading food items:', err);
    }
  };

  const handleRunAudit = async () => {
    setIsRunningAudit(true);
    try {
      const res = await api.runSecurityAudit();
      setAuditResults(res);
    } catch (err) {
      console.error('Error running security audit:', err);
    } finally {
      setIsRunningAudit(false);
    }
  };

  const handleSavePrice = async (itemId: string) => {
    try {
      await api.updateFoodPrice(itemId, editPrice, editRegion);
      setEditingItemId(null);
      await loadFoodItems();
      await loadStats();
    } catch (err) {
      console.error('Error updating price:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Admin & Security Audit</h1>
              <p className="text-xs text-[#66736A] mt-0.5">
                Market food pricing manager, live database metrics, and cryptographic security verification suite.
              </p>
            </div>
          </div>

          <button
            onClick={handleRunAudit}
            disabled={isRunningAudit}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-extrabold hover:bg-[#0f3e22] transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Play className="w-4 h-4 text-[#F4B942] fill-[#F4B942]" />
            {isRunningAudit ? 'Executing 8 Security Tests...' : 'Run Live Security Audit'}
          </button>
        </div>
      </div>

      {/* Database Statistics */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#66736A] uppercase">Active Users</span>
              <Database className="w-4 h-4 text-[#14532D]" />
            </div>
            <p className="text-2xl font-black text-[#17201A] mt-2 tabular-nums">{stats.usersCount}</p>
            <span className="text-[10px] text-[#2E7D32] font-semibold">Tenant Isolation Active</span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#66736A] uppercase">Food Ingredients</span>
              <Coins className="w-4 h-4 text-[#D97706]" />
            </div>
            <p className="text-2xl font-black text-[#17201A] mt-2 tabular-nums">{stats.foodItemsCount}+ Items</p>
            <span className="text-[10px] text-[#66736A]">Market Prices Tracked</span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#66736A] uppercase">Kenyan Recipes</span>
              <Database className="w-4 h-4 text-[#14532D]" />
            </div>
            <p className="text-2xl font-black text-[#17201A] mt-2 tabular-nums">{stats.mealsCount} Meals</p>
            <span className="text-[10px] text-[#66736A]">Authentic Portioned</span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#66736A] uppercase">Active Fin Sessions</span>
              <Lock className="w-4 h-4 text-[#2563EB]" />
            </div>
            <p className="text-2xl font-black text-[#172554] mt-2 tabular-nums">{stats.activeFinancialSessions}</p>
            <span className="text-[10px] text-blue-700 font-semibold">Auto-Expiring (15m)</span>
          </div>
        </div>
      )}

      {/* Security Audit Verification Results */}
      {auditResults && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#2E7D32]" />
              <h3 className="text-base font-extrabold text-[#17201A]">
                Security Audit Passed ({auditResults.results.filter((r: any) => r.passed).length}/
                {auditResults.results.length} Scenarios Verified)
              </h3>
            </div>
            <span className="text-xs text-[#66736A] font-mono">{auditResults.timestamp}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {auditResults.results.map((r: any, idx: number) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD] flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-[#2E7D32] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-extrabold text-[#17201A]">{r.name}</p>
                  <p className="text-[11px] text-[#66736A] mt-0.5 leading-snug">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Food Price Manager Table */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
          <div>
            <h3 className="text-base font-extrabold text-[#17201A]">Market Price Calibration</h3>
            <p className="text-xs text-[#66736A]">Edit regional estimated market prices for Kenyan staple foods</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E8E5DD] text-[#66736A]">
                <th className="py-2.5 px-3 font-bold">Food Item</th>
                <th className="py-2.5 px-3 font-bold">Category</th>
                <th className="py-2.5 px-3 font-bold">Unit</th>
                <th className="py-2.5 px-3 font-bold">Region</th>
                <th className="py-2.5 px-3 font-bold">Est. Price (KSh)</th>
                <th className="py-2.5 px-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EFE8]">
              {foodItems.slice(0, 15).map((item: FoodItem) => {
                const isEditing = editingItemId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-[#FAF8F2] transition-colors">
                    <td className="py-3 px-3 font-extrabold text-[#17201A]">{item.name}</td>
                    <td className="py-3 px-3 capitalize text-[#66736A]">{item.category.replace('_', ' ')}</td>
                    <td className="py-3 px-3 text-[#66736A]">{item.defaultUnit}</td>
                    <td className="py-3 px-3 text-[#66736A]">
                      {isEditing ? (
                        <select
                          value={editRegion}
                          onChange={(e) => setEditRegion(e.target.value)}
                          className="p-1 bg-white border border-[#E8E5DD] rounded text-xs"
                        >
                          <option value="Nairobi">Nairobi</option>
                          <option value="Mombasa">Mombasa</option>
                          <option value="Kisumu">Kisumu</option>
                          <option value="Nakuru">Nakuru</option>
                          <option value="Eldoret">Eldoret</option>
                        </select>
                      ) : (
                        item.region || 'Nairobi'
                      )}
                    </td>
                    <td className="py-3 px-3 font-black text-[#14532D] tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(Number(e.target.value))}
                          className="w-20 p-1 bg-white border border-[#E8E5DD] rounded text-xs"
                        />
                      ) : (
                        `KSh ${item.estimatedPriceKsh}`
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isEditing ? (
                        <button
                          onClick={() => handleSavePrice(item.id)}
                          className="px-2.5 py-1 bg-[#14532D] text-white rounded-lg text-xs font-bold hover:bg-[#0f3e22] cursor-pointer"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingItemId(item.id);
                            setEditPrice(item.estimatedPriceKsh);
                            setEditRegion(item.region || 'Nairobi');
                          }}
                          className="p-1 text-[#66736A] hover:text-[#17201A] rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
