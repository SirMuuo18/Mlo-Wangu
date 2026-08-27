// Account + navigation hub for everything without its own tab: Family,
// Notifications, AI Assistant, and the shared About/FAQ/Contact content.
// There is no dedicated account page on the web app to port (only a Navbar
// dropdown) — this screen is new mobile navigation structure holding
// existing functionality, not new business logic.
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../../components/Screen';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { Button } from '../../../../components/Button';
import { useAuth } from '../../../../context/AuthContext';
import { colors, radius, spacing } from '../../../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/(app)/(tabs)/more/account', label: 'Account Settings', icon: 'settings' },
  { href: '/(app)/(tabs)/more/reminders', label: 'Reminders', icon: 'alarm' },
  { href: '/(app)/(tabs)/more/family', label: 'Family Household', icon: 'people' },
  { href: '/(app)/(tabs)/more/notifications', label: 'Notifications', icon: 'notifications' },
  { href: '/(app)/(tabs)/more/ai-assistant', label: 'Mlo Wangu Assistant', icon: 'chatbubble-ellipses' },
  { href: '/(app)/(tabs)/more/about', label: 'About Us', icon: 'heart' },
  { href: '/(app)/(tabs)/more/faq', label: 'FAQ / Help', icon: 'help-circle' },
  { href: '/(app)/(tabs)/more/contact', label: 'Contact Support', icon: 'mail' },
];

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      // The (auth)/_layout.tsx and (app)/_layout.tsx guards would redirect
      // on their own once `status` flips to 'unauthenticated', but routing
      // there explicitly avoids a visible flash of this now-stale screen.
      router.replace('/(auth)/login');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Screen scroll>
      <AppText variant="title">More</AppText>

      <Card style={styles.card}>
        <View style={styles.profileRow}>
          {user?.isPremium ? (
            <View style={styles.premiumBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
              <AppText variant="caption" color={colors.forestDeep}>Premium</AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="subheading">{user?.name}</AppText>
        <AppText variant="caption" color={colors.moss}>{user?.email}</AppText>
      </Card>

      <View style={styles.linkList}>
        {LINKS.map((link) => (
          <Pressable key={link.href} style={styles.row} onPress={() => router.push(link.href as any)}>
            <Ionicons name={link.icon} size={20} color={colors.forest} />
            <AppText variant="bodyBold" style={styles.rowLabel}>{link.label}</AppText>
            <Ionicons name="chevron-forward" size={18} color={colors.moss} />
          </Pressable>
        ))}
      </View>

      <View style={styles.spacer} />

      <Button label="Log Out" variant="secondary" onPress={handleLogout} loading={isSigningOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg, marginBottom: spacing.lg },
  profileRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.xs },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  linkList: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rowLabel: { flex: 1 },
  spacer: { height: spacing.xl },
});
