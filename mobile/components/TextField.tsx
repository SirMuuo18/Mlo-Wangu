import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../constants/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ label, error, style, ...rest }) => (
  <View style={styles.container}>
    <AppText variant="label" color={colors.moss} style={styles.label}>
      {label}
    </AppText>
    <TextInput
      style={[styles.input, error ? styles.inputError : undefined, style]}
      placeholderTextColor={colors.moss}
      autoCapitalize="none"
      autoCorrect={false}
      {...rest}
    />
    {error ? (
      <AppText variant="caption" color={colors.danger} style={styles.error}>
        {error}
      </AppText>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { marginBottom: spacing.xs },
  input: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs },
});
