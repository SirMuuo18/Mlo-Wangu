// Renders src/data/supportContent.ts's ABOUT_INTRO/ABOUT_SECTIONS verbatim
// — the exact same content the web app's AboutView.tsx renders, just with
// native components instead of Tailwind divs. No copy here was written for
// mobile; it's all imported.
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { ABOUT_INTRO, ABOUT_SECTIONS } from '../../../../lib/supportContent';
import { colors, spacing } from '../../../../constants/theme';

export default function AboutScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="heart" size={22} color={colors.forest} />
        <AppText variant="heading" style={styles.headerTitle}>About Mlo Wangu</AppText>
      </View>
      <AppText variant="body" color={colors.moss} style={styles.intro}>{ABOUT_INTRO}</AppText>

      {ABOUT_SECTIONS.map((section) => (
        <Card key={section.heading} style={styles.card}>
          <AppText variant="subheading" style={styles.sectionHeading}>{section.heading}</AppText>
          <AppText variant="body" color={colors.moss}>{section.body}</AppText>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  headerTitle: {},
  intro: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  sectionHeading: { marginBottom: spacing.xs },
});
