import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, Plus, UserCheck, ShieldAlert, Heart, AlertCircle, Edit2, Trash2, X, Check } from 'lucide-react';
import { AgeGroup, HouseholdMember } from '../types';

export const FamilyView: React.FC = () => {
  const { household, updateHousehold, isProfileLoading } = useApp();

  const [isEditingMember, setIsEditingMember] = useState<HouseholdMember | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form State
  const [memberName, setMemberName] = useState('');
  const [memberAge, setMemberAge] = useState<AgeGroup>('adult');
  const [preferencesStr, setPreferencesStr] = useState('');
  const [allergiesStr, setAllergiesStr] = useState('');
  const [dislikesStr, setDislikesStr] = useState('');
  const [nutritionGoals, setNutritionGoals] = useState('');

  const openEdit = (m: HouseholdMember) => {
    setIsEditingMember(m);
    setMemberName(m.name);
    setMemberAge(m.ageGroup);
    setPreferencesStr(m.preferences.join(', '));
    setAllergiesStr(m.allergies.join(', '));
    setDislikesStr(m.dislikes.join(', '));
    setNutritionGoals(m.nutritionGoals || '');
  };

  const openAdd = () => {
    setIsAddingNew(true);
    setMemberName('');
    setMemberAge('adult');
    setPreferencesStr('');
    setAllergiesStr('');
    setDislikesStr('');
    setNutritionGoals('');
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!household || !memberName.trim()) return;

    const parseList = (str: string) =>
      str
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    let updatedMembers = [...household.members];

    if (isEditingMember) {
      updatedMembers = updatedMembers.map((m) =>
        m.id === isEditingMember.id
          ? {
              ...m,
              name: memberName.trim(),
              ageGroup: memberAge,
              preferences: parseList(preferencesStr),
              allergies: parseList(allergiesStr),
              dislikes: parseList(dislikesStr),
              nutritionGoals: nutritionGoals.trim(),
            }
          : m
      );
    } else if (isAddingNew) {
      const newMember: HouseholdMember = {
        id: `mem_${Date.now()}`,
        name: memberName.trim(),
        ageGroup: memberAge,
        preferences: parseList(preferencesStr),
        allergies: parseList(allergiesStr),
        dislikes: parseList(dislikesStr),
        nutritionGoals: nutritionGoals.trim(),
      };
      updatedMembers.push(newMember);
    }

    await updateHousehold({
      ...household,
      members: updatedMembers,
    });

    setIsEditingMember(null);
    setIsAddingNew(false);
  };

  const handleDeleteMember = async (id: string) => {
    if (!household) return;
    if (household.members.length <= 1) {
      alert('Your household must have at least 1 member.');
      return;
    }
    const updated = household.members.filter((m) => m.id !== id);
    await updateHousehold({ ...household, members: updated });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Profile Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">
                {isProfileLoading ? (
                  <span className="inline-block h-6 w-40 bg-[#E8E5DD] rounded animate-pulse align-middle" />
                ) : (
                  household?.name || 'My Family'
                )}
              </h1>
              <p className="text-xs text-[#66736A] mt-0.5">
                {household?.members?.length || 5} Family Members • Scaled Meal Portions & Personalized Health Needs
              </p>
            </div>
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14532D] text-white text-xs font-bold hover:bg-[#0f3e22] transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Add Family Member
          </button>
        </div>

        {/* Privacy Note Banner */}
        <div className="mt-5 p-3.5 bg-[#FAF8F2] rounded-2xl border border-[#E8E5DD] flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" />
          <div className="text-xs text-[#66736A] leading-relaxed">
            <span className="font-bold text-[#17201A]">Family Privacy Architecture:</span> Meal plans and recipes are shared with the whole family. Private budgets, income, expenses, and savings targets remain strictly locked behind your personal PIN.
          </div>
        </div>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {household?.members?.map((m) => (
          <div
            key={m.id}
            className="bg-white p-5 rounded-3xl border border-[#E8E5DD] shadow-xs flex flex-col justify-between hover:border-[#14532D]/40 transition-all"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#14532D] uppercase bg-[#FAF8F2] px-2.5 py-1 rounded-md border border-[#E8E5DD]">
                  {m.ageGroup}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(m)}
                    className="p-1.5 text-[#66736A] hover:text-[#17201A] hover:bg-[#FAF8F2] rounded-lg transition-colors cursor-pointer"
                    title="Edit Member"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteMember(m.id)}
                    className="p-1.5 text-[#C62828] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove Member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-base font-extrabold text-[#17201A] mt-3">{m.name}</h3>

              {/* Preferences */}
              <div className="mt-3 space-y-2 text-xs">
                {m.preferences.length > 0 && (
                  <div>
                    <span className="text-[#66736A] font-bold block text-[11px]">Favorite Foods:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.preferences.map((p) => (
                        <span key={p} className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allergies / Dislikes */}
                {(m.allergies.length > 0 || m.dislikes.length > 0) && (
                  <div>
                    <span className="text-[#66736A] font-bold block text-[11px]">Allergies & Avoid:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.allergies.map((a) => (
                        <span key={a} className="bg-red-50 text-red-800 px-2 py-0.5 rounded text-[11px] font-bold">
                          ⚠️ {a}
                        </span>
                      ))}
                      {m.dislikes.map((d) => (
                        <span key={d} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[11px]">
                          No {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nutrition Goals */}
                {m.nutritionGoals && (
                  <div className="p-2 bg-[#FAF8F2] rounded-xl border border-[#E8E5DD] mt-2">
                    <span className="text-[10px] font-bold text-[#14532D] uppercase block">Health Goal:</span>
                    <p className="text-[11px] text-[#17201A] mt-0.5 font-medium">{m.nutritionGoals}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#F1EFE8] flex items-center justify-between text-[11px] text-[#66736A]">
              <span>Portion Factor: {m.ageGroup === 'adult' ? '1.0x' : m.ageGroup === 'teen' ? '1.2x' : '0.6x'}</span>
              <span className="text-emerald-700 font-bold">✓ Included in Plan</span>
            </div>
          </div>
        ))}
      </div>

      {/* Member Modal (Add / Edit) */}
      {(isAddingNew || isEditingMember) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8E5DD] animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
              <h3 className="font-extrabold text-base text-[#17201A]">
                {isAddingNew ? 'Add Family Member' : 'Edit Member Details'}
              </h3>
              <button
                onClick={() => {
                  setIsAddingNew(false);
                  setIsEditingMember(null);
                }}
                className="p-1 text-[#66736A] hover:text-[#17201A] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#17201A] block mb-1">Full Name or Nickname</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kamau (Son)"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              <div>
                <label className="font-bold text-[#17201A] block mb-1">Age Group</label>
                <select
                  value={memberAge}
                  onChange={(e) => setMemberAge(e.target.value as AgeGroup)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none"
                >
                  <option value="adult">Adult (Standard portion)</option>
                  <option value="teen">Teenager (High energy / sports portion)</option>
                  <option value="child">Child (Kid-friendly portion)</option>
                  <option value="infant">Toddler / Infant (Soft / porridge)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#17201A] block mb-1">Food Preferences (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Chapatis, Beef stew, Ugali"
                  value={preferencesStr}
                  onChange={(e) => setPreferencesStr(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              <div>
                <label className="font-bold text-[#17201A] block mb-1">Allergies (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Peanuts, Seafood, Dairy"
                  value={allergiesStr}
                  onChange={(e) => setAllergiesStr(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              <div>
                <label className="font-bold text-[#17201A] block mb-1">Dislikes / Avoid</label>
                <input
                  type="text"
                  placeholder="e.g. Chili, Bitter greens (Managu)"
                  value={dislikesStr}
                  onChange={(e) => setDislikesStr(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              <div>
                <label className="font-bold text-[#17201A] block mb-1">Nutrition & Health Goal (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Low sodium, high protein for gym, slow energy"
                  value={nutritionGoals}
                  onChange={(e) => setNutritionGoals(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14532D]"
                />
              </div>

              <div className="pt-3 border-t border-[#F1EFE8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setIsEditingMember(null);
                  }}
                  className="px-4 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl font-bold text-[#66736A] hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#14532D] text-white rounded-xl font-bold hover:bg-[#0f3e22]"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
