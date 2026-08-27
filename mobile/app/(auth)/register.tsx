import React, { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { AppText } from '../../components/AppText';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/theme';

// Same requirement as server.ts's /api/auth/register (password.length < 8
// is rejected there) — checked here too only so the user gets the message
// instantly instead of waiting on a round trip; the server re-validates
// regardless, so this is a UX nicety, not the actual enforcement.
const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email.trim(), password, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Logo />
        <AppText variant="title" style={styles.title}>Create your account</AppText>
        <AppText variant="body" color={colors.moss} style={styles.subtitle}>
          Plan Kenyan meals and manage your household budget.
        </AppText>
      </View>

      <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        textContentType="newPassword"
        placeholder="At least 8 characters"
      />

      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <Button label="Create Account" onPress={handleSubmit} loading={isSubmitting} style={styles.submit} />

      <View style={styles.footer}>
        <AppText variant="body" color={colors.moss}>Already have an account? </AppText>
        <Link href="/(auth)/login">
          <AppText variant="bodyBold" color={colors.forest}>Sign In</AppText>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.xl },
  title: { marginTop: spacing.lg, textAlign: 'center' },
  subtitle: { marginTop: spacing.sm, textAlign: 'center' },
  error: { marginBottom: spacing.md },
  submit: { marginTop: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
