import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { colors, spacing } from '../constants/theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

// Always shows a plain, user-facing message — never a raw server error or
// stack trace. Callers (screens) are responsible for turning an ApiError
// into copy like this; this component just renders it consistently.
export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <View style={styles.container}>
    <AppText variant="bodyBold" color={colors.danger} style={styles.message}>
      {message}
    </AppText>
    {onRetry ? <Button label="Try Again" variant="secondary" onPress={onRetry} /> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  message: { textAlign: 'center' },
});
