// Smart Shopping List — real, persisted data generated server-side from the
// current meal plan (server.ts regenerates it on every generate/swap/save).
// Manually-added items (Phase 3B, item 10) use the exact same whole-list PUT
// as toggling an item — the only difference is source:'manual', which is
// what makes secureDb.saveMealPlan preserve it across the next regeneration
// instead of wiping it like every source:'generated' item.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components/AppText';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/EmptyState';
import { TextField } from '../../../components/TextField';
import { Button } from '../../../components/Button';
import { useShoppingList, useUpdateShoppingList } from '../../../hooks/useShopping';
import { colors, radius, spacing } from '../../../constants/theme';
import { api } from '../../../lib/api';
import type { ShoppingItem, ShoppingCategory } from '../../../types/domain';

const CATEGORY_LABELS: Record<string, string> = {
  carbohydrates: 'Cereals, Flour & Tubers',
  proteins: 'Proteins & Legumes',
  vegetables: 'Vegetables & Greens',
  fruits: 'Fruits',
  dairy: 'Dairy & Milks',
  spices_pantry: 'Pantry & Spices',
  household: 'Household',
  cleaning: 'Cleaning',
  personal_care: 'Personal Care',
  utilities: 'Utilities',
  other: 'Other',
};

const NON_FOOD_OPTIONS: { key: ShoppingCategory; label: string }[] = [
  { key: 'household', label: 'Household' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'personal_care', label: 'Personal Care' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'other', label: 'Other' },
];

const FREQUENCY_LABELS: Record<'weekly' | 'monthly', string> = {
  weekly: 'Buy This Week',
  monthly: 'Buy This Month',
};

type FrequencyGroup = {
  frequency: 'weekly' | 'monthly';
  categories: [string, ShoppingItem[]][];
};

export default function ShoppingScreen() {
  const { data: shoppingList, isLoading, isError, refetch } = useShoppingList();
  const updateList = useUpdateShoppingList();
  const [toggling, setToggling] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnit, setNewUnit] = useState('pc');
  const [newPrice, setNewPrice] = useState('0');
  const [newCategory, setNewCategory] = useState<'' | ShoppingCategory>('');
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; quantity: number; unit: string } | null>(null);
  const duplicateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (duplicateTimer.current) clearTimeout(duplicateTimer.current);
    if (!newName.trim()) { setDuplicateWarning(null); return; }
    duplicateTimer.current = setTimeout(() => {
      api.checkShoppingDuplicate(newName.trim())
        .then((res) => setDuplicateWarning(res.duplicate && res.existingItem ? res.existingItem : null))
        .catch(() => {});
    }, 400);
    return () => { if (duplicateTimer.current) clearTimeout(duplicateTimer.current); };
  }, [newName]);

  const items = shoppingList?.items ?? [];
  const totalCost = items.reduce((sum, i) => sum + (i.estimatedPriceKsh || 0), 0);
  const purchasedCount = items.filter((i) => i.isPurchased).length;

  const sections = useMemo<FrequencyGroup[]>(() => {
    const byFrequency = new Map<'weekly' | 'monthly', Map<string, ShoppingItem[]>>([
      ['weekly', new Map()],
      ['monthly', new Map()],
    ]);
    for (const item of items) {
      const freq = item.frequency === 'monthly' ? 'monthly' : 'weekly';
      const byCategory = byFrequency.get(freq)!;
      const key = item.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(item);
    }
    return (['weekly', 'monthly'] as const)
      .map((frequency) => ({ frequency, categories: Array.from(byFrequency.get(frequency)!.entries()) }))
      .filter((group) => group.categories.length > 0);
  }, [items]);

  const handleToggle = async (item: ShoppingItem) => {
    if (!shoppingList) return;
    setToggling(item.id);
    const updatedItems = shoppingList.items.map((i) => (i.id === item.id ? { ...i, isPurchased: !i.isPurchased } : i));
    try {
      await updateList.mutateAsync({ ...shoppingList, items: updatedItems });
    } finally {
      setToggling(null);
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    const base: ShoppingItem[] = shoppingList?.items ?? [];
    const newItem: ShoppingItem = {
      // Empty category (not 'other') when the user leaves it on "Food" —
      // lets the server infer the specific food subcategory from the name.
      id: `manual_${Date.now()}`, category: (newCategory || '') as ShoppingCategory, name: newName.trim(),
      quantity: Number(newQty) || 1, unit: newUnit.trim() || 'pc',
      estimatedPriceKsh: Number(newPrice) || 0, isPurchased: false,
      frequency: 'weekly', source: 'manual',
    };
    await updateList.mutateAsync({
      id: shoppingList?.id ?? `sl_${Date.now()}`,
      userId: shoppingList?.userId ?? '',
      weekStartDate: shoppingList?.weekStartDate ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
      items: [...base, newItem],
    });
    setNewName('');
    setNewQty('1');
    setNewUnit('pc');
    setNewPrice('0');
    setNewCategory('');
    setDuplicateWarning(null);
    setShowAddForm(false);
  };

  const handleRemoveManual = async (itemId: string) => {
    if (!shoppingList) return;
    await updateList.mutateAsync({ ...shoppingList, items: shoppingList.items.filter((i) => i.id !== itemId) });
  };

  if (isLoading) return <LoadingState label="Loading your shopping list…" />;
  if (isError) return <ErrorState message="Could not load your shopping list." onRetry={refetch} />;
  if (!shoppingList || items.length === 0) {
    return <EmptyState title="No shopping list yet" message="Generate a meal plan first — your list builds itself from it." />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sections}
      keyExtractor={(group) => group.frequency}
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <AppText variant="title">Shopping List</AppText>
            <Pressable onPress={() => setShowAddForm((v) => !v)} style={styles.addButton}>
              <Ionicons name="add" size={18} color={colors.forest} />
              <AppText variant="bodyBold" color={colors.forest}>Add Item</AppText>
            </Pressable>
          </View>
          <View style={styles.summaryRow}>
            <SummaryStat label="Total Cost" value={`KSh ${totalCost.toLocaleString()}`} />
            <SummaryStat label="Purchased" value={`${purchasedCount} / ${items.length}`} />
          </View>
          {showAddForm && (
            <View style={styles.addForm}>
              <TextField label="Item name" value={newName} onChangeText={setNewName} placeholder="e.g. Dish soap, Toilet paper, Tomatoes" />
              {duplicateWarning && (
                <AppText variant="caption" color="#B45309">
                  {duplicateWarning.name} — Already added · {duplicateWarning.quantity} {duplicateWarning.unit}
                </AppText>
              )}
              <View style={styles.categoryChips}>
                <Pressable
                  style={[styles.categoryChip, !newCategory && styles.categoryChipActive]}
                  onPress={() => setNewCategory('')}
                >
                  <AppText variant="caption" color={!newCategory ? colors.cream : colors.moss}>Food</AppText>
                </Pressable>
                {NON_FOOD_OPTIONS.map((c) => (
                  <Pressable
                    key={c.key}
                    style={[styles.categoryChip, newCategory === c.key && styles.categoryChipActive]}
                    onPress={() => setNewCategory(c.key)}
                  >
                    <AppText variant="caption" color={newCategory === c.key ? colors.cream : colors.moss}>{c.label}</AppText>
                  </Pressable>
                ))}
              </View>
              <View style={styles.addFormRow}>
                <View style={styles.addFormField}>
                  <TextField label="Qty" value={newQty} onChangeText={setNewQty} keyboardType="numeric" />
                </View>
                <View style={styles.addFormField}>
                  <TextField label="Unit" value={newUnit} onChangeText={setNewUnit} />
                </View>
                <View style={styles.addFormField}>
                  <TextField label="Est. KSh" value={newPrice} onChangeText={setNewPrice} keyboardType="numeric" />
                </View>
              </View>
              <Button label="Add" onPress={handleAddItem} disabled={!newName.trim()} loading={updateList.isPending} />
            </View>
          )}
        </View>
      }
      renderItem={({ item: group }) => (
        <View style={styles.frequencyGroup}>
          <AppText variant="bodyBold" color={colors.forest} style={styles.frequencyLabel}>
            {FREQUENCY_LABELS[group.frequency]}
          </AppText>
          {group.categories.map(([category, categoryItems]) => (
            <View key={category} style={styles.section}>
              <AppText variant="label" color={colors.moss} style={styles.sectionLabel}>
                {CATEGORY_LABELS[category] || category}
              </AppText>
              {categoryItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => handleToggle(item)}
                  disabled={toggling === item.id}
                >
                  <Ionicons
                    name={item.isPurchased ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={item.isPurchased ? colors.forest : colors.moss}
                  />
                  <View style={styles.itemText}>
                    <AppText
                      variant="body"
                      color={item.isPurchased ? colors.moss : colors.ink}
                      style={item.isPurchased ? styles.strikethrough : undefined}
                    >
                      {item.name}
                    </AppText>
                    <AppText variant="caption" color={colors.moss}>{item.quantity} {item.unit}</AppText>
                  </View>
                  <AppText variant="bodyBold">KSh {item.estimatedPriceKsh}</AppText>
                  {item.source === 'manual' && (
                    <Pressable onPress={() => handleRemoveManual(item.id)} hitSlop={8} style={styles.removeButton}>
                      <Ionicons name="close" size={16} color={colors.moss} />
                    </Pressable>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    />
  );
}

const SummaryStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.summaryStat}>
    <AppText variant="caption" color={colors.moss}>{label}</AppText>
    <AppText variant="bodyBold" style={styles.summaryValue}>{value}</AppText>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  addForm: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, gap: spacing.xs },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryChip: { paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  categoryChipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  addFormRow: { flexDirection: 'row', gap: spacing.sm },
  addFormField: { flex: 1 },
  removeButton: { padding: spacing.xs, marginLeft: spacing.xs },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg },
  summaryStat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  summaryValue: { marginTop: 2 },
  frequencyGroup: { marginBottom: spacing.md },
  frequencyLabel: { marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { marginBottom: spacing.lg },
  sectionLabel: { marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemText: { flex: 1 },
  strikethrough: { textDecorationLine: 'line-through' },
});
