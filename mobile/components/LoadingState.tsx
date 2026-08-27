import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../constants/theme';

export const LoadingState: React.FC<{ label?: string }> = ({ label }) => (
  <View style={styles.container}>
    <ActivityIndicator size="large" color={colors.forest} />
    {label ? (
      <AppText variant="caption" color={colors.moss} style={styles.label}>
        {label}
      </AppText>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  label: { marginTop: spacing.md },
});
