// Shared shell for this phase's navigation placeholders. Deliberately does
// not fetch or display any real meal/budget/shopping data — Phase 1 exists
// to prove the authenticated navigation shell and Bearer-auth API path
// work, not to build these features (see Section 25, "No Feature Creep",
// of the Phase 1 brief). Each screen using this only supplies its own
// title/description/icon.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../constants/theme';

interface PlaceholderScreenProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ icon, title, description }) => (
  <Screen>
    <View style={styles.content}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={30} color={colors.forest} />
      </View>
      <AppText variant="heading" style={styles.title}>{title}</AppText>
      <AppText variant="body" color={colors.moss} style={styles.description}>
        {description}
      </AppText>
      <View style={styles.badge}>
        <AppText variant="label" color={colors.moss}>Coming in a later phase</AppText>
      </View>
    </View>
  </Screen>
);

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { textAlign: 'center', marginBottom: spacing.sm },
  description: { textAlign: 'center' },
  badge: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
