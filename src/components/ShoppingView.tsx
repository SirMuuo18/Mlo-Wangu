import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShoppingBag, CheckCircle2, Circle, Share2, Copy, Check, Search, Plus, X, PenLine } from 'lucide-react';
import { FoodCategory } from '../types';
import { getFoodImageUrl } from '../utils/foodImages';

export const ShoppingView: React.FC = () => {
  const { shoppingList, household, toggleShoppingItem, addManualShoppingItem, removeManualShoppingItem } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('pc');
  const [newItemPrice, setNewItemPrice] = useState('0');

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    await addManualShoppingItem(newItemName.trim(), Number(newItemQty) || 1, newItemUnit.trim() || 'pc', Number(newItemPrice) || 0);
    setNewItemName('');
    setNewItemQty('1');
    setNewItemUnit('pc');
    setNewItemPrice('0');
    setShowAddForm(false);
  };

  const items = shoppingList?.items || [];
  const purchasedCount = items.filter((i) => i.isPurchased).length;
  const totalCost = items.reduce((acc, curr) => acc + (curr.estimatedPriceKsh || (curr as any).estimatedCostKsh || 0), 0);
  const purchasedCost = items
    .filter((i) => i.isPurchased)
    .reduce((acc, curr) => acc + (curr.estimatedPriceKsh || (curr as any).estimatedCostKsh || 0), 0);

  const categoriesOrder: { key: FoodCategory; label: string }[] = [
    { key: 'carbohydrates', label: 'Cereals, Flour & Tubers' },
    { key: 'proteins', label: 'Proteins & Legumes (Meat, Fish, Beans)' },
    { key: 'vegetables', label: 'Fresh Market Vegetables & Greens' },
    { key: 'fruits', label: 'Fresh Fruits' },
    { key: 'dairy', label: 'Dairy & Milks' },
    { key: 'spices_pantry', label: 'Pantry, Cooking Oil & Spices' },
  ];

  const getItemName = (item: any) => item?.name || item?.foodItemName || 'Item';
  const getItemSwahili = (item: any) => item?.swahiliName || '';
  const getItemQuantity = (item: any) => item?.totalQuantity || `${item?.quantity || 1} ${item?.unit || 'unit'}`;
  const getItemCost = (item: any) => item?.estimatedPriceKsh || item?.estimatedCostKsh || 0;

  const filteredItems = items.filter((item) => {
    const name = getItemName(item).toLowerCase();
    const swahili = getItemSwahili(item).toLowerCase();
    const q = (searchQuery || '').toLowerCase().trim();

    const matchesSearch = !q || name.includes(q) || swahili.includes(q);
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleShareWhatsApp = () => {
    const safeTotal = Number(totalCost || 0);
    const lines = [
      `🛒 *Mlo Wangu Kenyan Grocery List — ${household?.name || 'My Family'}*`,
      `Estimated Market Total: ~KSh ${safeTotal.toLocaleString()}`,
      '',
    ];

    categoriesOrder.forEach(({ key, label }) => {
      const catItems = items.filter((i) => i.category === key);
      if (catItems.length > 0) {
        lines.push(`*${label}*`);
        catItems.forEach((i) => {
          const check = i.isPurchased ? '✅' : '⬜';
          lines.push(`${check} ${getItemName(i)} (${getItemQuantity(i)}) ~KSh ${getItemCost(i)}`);
        });
        lines.push('');
      }
    });

    lines.push('Generated with Mlo Wangu — Kenyan Meal & Budget Planner 🌾');
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyClipboard = () => {
    const safeTotal = Number(totalCost || 0);
    const lines = [
      `Mlo Wangu Kenyan Grocery List — ${household?.name || 'My Family'}`,
      `Total Estimated Cost: KSh ${safeTotal.toLocaleString()}`,
      '',
    ];
    items.forEach((i) => {
      lines.push(`- [${i.isPurchased ? 'X' : ' '}] ${getItemName(i)} (${getItemQuantity(i)}) - KSh ${getItemCost(i)}`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Smart Grocery List</h1>
              <p className="text-xs text-[#66736A] mt-0.5">
                Auto-aggregated from this week's meals with local estimated market prices and photo placeholders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14532D]/10 hover:bg-[#14532D]/20 text-[#14532D] text-xs font-bold border border-[#14532D]/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
            <button
              onClick={handleCopyClipboard}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF8F2] hover:bg-[#F1EFE8] text-[#17201A] text-xs font-bold border border-[#E8E5DD] transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy List'}</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share to WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Progress & Budget summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-[#F1EFE8]">
          <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
            <span className="text-[11px] font-bold text-[#66736A] uppercase">Total Estimated Cost</span>
            <p className="text-xl font-black text-[#17201A] mt-0.5 tabular-nums">
              KSh {Number(totalCost || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-[#66736A]">Based on local Kenyan market prices</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
            <span className="text-[11px] font-bold text-[#66736A] uppercase">Items Purchased</span>
            <p className="text-xl font-black text-[#14532D] mt-0.5 tabular-nums">
              {purchasedCount} / {items.length} items
            </p>
            <div className="w-full bg-white h-2 rounded-full mt-2 overflow-hidden border border-[#E8E5DD]">
              <div
                className="bg-[#14532D] h-full rounded-full transition-all duration-300"
                style={{ width: `${items.length ? (purchasedCount / items.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E8E5DD]">
            <span className="text-[11px] font-bold text-[#66736A] uppercase">Remaining to Spend</span>
            <p className="text-xl font-black text-[#D97706] mt-0.5 tabular-nums">
              KSh {(Number(totalCost || 0) - Number(purchasedCost || 0)).toLocaleString()}
            </p>
            <span className="text-[10px] text-[#66736A]">
              Already spent: KSh {Number(purchasedCost || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="mt-6 pt-4 border-t border-[#F1EFE8] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#66736A] absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search shopping items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'all' ? 'bg-[#14532D] text-white' : 'bg-[#FAF8F2] text-[#66736A] hover:bg-[#F1EFE8]'
              }`}
            >
              All Categories
            </button>
            {categoriesOrder.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedCategory(c.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === c.key ? 'bg-[#14532D] text-white' : 'bg-[#FAF8F2] text-[#66736A] hover:bg-[#F1EFE8]'
                }`}
              >
                {c.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        {showAddForm && (
          <form onSubmit={handleAddItem} className="mt-4 pt-4 border-t border-[#F1EFE8] flex flex-wrap items-end gap-2">
            <input
              type="text" placeholder="Item name (e.g. Dish soap)" value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)} required
              className="flex-1 min-w-[160px] px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
            <input
              type="number" min="0.1" step="0.1" placeholder="Qty" value={newItemQty}
              onChange={(e) => setNewItemQty(e.target.value)}
              className="w-20 px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
            <input
              type="text" placeholder="Unit" value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              className="w-20 px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
            <input
              type="number" min="0" placeholder="Est. KSh" value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              className="w-24 px-3 py-2 bg-[#FAF8F2] border border-[#E8E5DD] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-[#14532D] text-white text-xs font-bold cursor-pointer">
              Add
            </button>
          </form>
        )}
      </div>

      {/* Manually Added Items — persist across meal-plan regeneration */}
      {items.some((i) => i.source === 'manual') && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F1EFE8]">
            <PenLine className="w-4 h-4 text-[#14532D]" />
            <h3 className="text-sm font-extrabold text-[#17201A]">Added by You</h3>
          </div>
          <div className="divide-y divide-[#F1EFE8] mt-2">
            {items.filter((i) => i.source === 'manual').map((item) => (
              <div
                key={item.id}
                className={`py-3 px-2 rounded-xl flex items-center justify-between ${item.isPurchased ? 'opacity-50 bg-[#FAF8F2]' : ''}`}
              >
                <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => toggleShoppingItem(item.id)}>
                  {item.isPurchased ? (
                    <CheckCircle2 className="w-5 h-5 text-[#2E7D32] fill-green-100 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#9CA3AF] shrink-0" />
                  )}
                  <p className={`text-xs font-bold ${item.isPurchased ? 'line-through text-[#66736A]' : 'text-[#17201A]'}`}>
                    {item.name} <span className="text-[#66736A] font-medium">({item.quantity} {item.unit})</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-extrabold text-[#17201A] tabular-nums">KSh {item.estimatedPriceKsh}</span>
                  <button onClick={() => removeManualShoppingItem(item.id)} className="text-[#66736A] hover:text-red-600 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorized Grocery List */}
      <div className="space-y-6">
        {categoriesOrder.map(({ key, label }) => {
          const categoryItems = filteredItems.filter((i) => i.category === key);
          if (categoryItems.length === 0) return null;

          return (
            <div key={key} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#F1EFE8]">
                <h3 className="text-sm font-extrabold text-[#17201A]">{label}</h3>
                <span className="text-xs font-bold text-[#14532D] tabular-nums">
                  ~KSh {categoryItems.reduce((acc, curr) => acc + getItemCost(curr), 0).toLocaleString()}
                </span>
              </div>

              <div className="divide-y divide-[#F1EFE8] mt-2">
                {categoryItems.map((item) => {
                  const name = getItemName(item);
                  const swahili = getItemSwahili(item);
                  const qty = getItemQuantity(item);
                  const cost = getItemCost(item);
                  const itemImg = getFoodImageUrl(name, item.category);

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleShoppingItem(item.id)}
                      className={`py-3 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-between ${
                        item.isPurchased ? 'opacity-50 bg-[#FAF8F2]' : 'hover:bg-[#FAF8F2]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.isPurchased ? (
                          <CheckCircle2 className="w-5 h-5 text-[#2E7D32] fill-green-100 shrink-0" />
                        ) : (
                          <Circle className="w-5 h-5 text-[#9CA3AF] shrink-0" />
                        )}

                        {/* Small Photo Placeholder */}
                        <div className="w-8 h-8 rounded-lg bg-gray-200 overflow-hidden shrink-0 border border-[#E8E5DD]">
                          <img
                            src={itemImg}
                            alt={name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>

                        <div>
                          <p className={`text-xs font-bold ${item.isPurchased ? 'line-through text-[#66736A]' : 'text-[#17201A]'}`}>
                            {name}
                          </p>
                          {swahili && (
                            <p className="text-[10px] text-[#14532D] italic font-medium">{swahili}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <span className="text-xs text-[#66736A] font-semibold">{qty}</span>
                        <span className="text-xs font-extrabold text-[#17201A] tabular-nums min-w-[70px]">
                          KSh {cost}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
