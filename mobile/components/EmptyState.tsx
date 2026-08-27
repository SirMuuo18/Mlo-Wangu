import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../constants/theme';

interface EmptyStateProps {
  title: string;
  message?: string;
}

// Used by this phase's placeholder screens ("this is where X will live")
// and, later, by real empty-data states (no meal plan yet, no expenses
// logged, etc.) — one consistent shape for both.
export const EmptyState: React.FC<EmptyStateProps> = ({ title, message }) => (
  <View style={styles.container}>
    <AppText variant="heading" style={styles.title}>
      {title}
    </AppText>
    {message ? (
      <AppText variant="body" color={colors.moss} style={styles.message}>
        {message}
      </AppText>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { textAlign: 'center', marginBottom: spacing.sm },
  message: { textAlign: 'center' },
});
