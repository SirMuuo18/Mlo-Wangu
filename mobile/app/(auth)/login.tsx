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

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Navigation on success is handled entirely by the (auth) layout guard
  // reacting to AuthContext's status flipping to 'authenticated' — this
  // screen doesn't need to (and shouldn't) navigate imperatively itself.
  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Logo />
        <AppText variant="title" style={styles.title}>Karibu Mlo Wangu</AppText>
        <AppText variant="body" color={colors.moss} style={styles.subtitle}>
          Sign in to your Kenyan meal &amp; budget companion.
        </AppText>
      </View>

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
        autoComplete="password"
        textContentType="password"
        placeholder="••••••••"
      />

      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <Button label="Sign In" onPress={handleSubmit} loading={isSubmitting} style={styles.submit} />

      <View style={styles.footer}>
        <AppText variant="body" color={colors.moss}>Don&apos;t have an account? </AppText>
        <Link href="/(auth)/register">
          <AppText variant="bodyBold" color={colors.forest}>Register</AppText>
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
