// Renders src/data/supportContent.ts's FAQ_CATEGORIES verbatim as a native
// accordion — same questions/answers as the web app's FAQView.tsx, nothing
// invented here.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { FAQ_CATEGORIES } from '../../../../lib/supportContent';
import { colors, spacing } from '../../../../constants/theme';

export default function FaqScreen() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="help-circle" size={22} color={colors.forest} />
        <AppText variant="heading">Frequently Asked Questions</AppText>
      </View>

      {FAQ_CATEGORIES.map((cat) => (
        <View key={cat.category} style={styles.categoryBlock}>
          <AppText variant="label" color={colors.moss} style={styles.categoryLabel}>{cat.category}</AppText>
          {cat.items.map((item) => {
            const key = `${cat.category}-${item.q}`;
            const isOpen = openKey === key;
            return (
              <Card key={key} style={styles.card}>
                <Pressable onPress={() => setOpenKey(isOpen ? null : key)} style={styles.questionRow}>
                  <AppText variant="bodyBold" style={styles.question}>{item.q}</AppText>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.moss} />
                </Pressable>
                {isOpen ? (
                  <AppText variant="body" color={colors.moss} style={styles.answer}>{item.a}</AppText>
                ) : null}
              </Card>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  categoryBlock: { marginBottom: spacing.md },
  categoryLabel: { marginBottom: spacing.sm },
  card: { marginBottom: spacing.sm },
  questionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  question: { flex: 1 },
  answer: { marginTop: spacing.sm },
});
