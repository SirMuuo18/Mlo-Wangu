import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { Button } from '../../../../components/Button';
import { SUPPORT_EMAIL, SUPPORT_MAILTO, CONTACT_REASONS } from '../../../../lib/supportContent';
import { colors, radius, spacing } from '../../../../constants/theme';

export default function ContactScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="mail" size={22} color={colors.forest} />
        <AppText variant="heading">Contact & Support</AppText>
      </View>

      <Card style={styles.emailCard}>
        <AppText variant="caption" color={colors.moss}>We&apos;re happy to help with your Mlo Wangu account</AppText>
        <Button
          label={`Email ${SUPPORT_EMAIL}`}
          onPress={() => Linking.openURL(SUPPORT_MAILTO)}
          style={styles.emailButton}
        />
      </Card>

      <AppText variant="label" color={colors.moss} style={styles.reasonsLabel}>What we can help with</AppText>
      {CONTACT_REASONS.map((reason) => (
        <Card key={reason.label} style={styles.reasonCard}>
          <AppText variant="bodyBold">{reason.label}</AppText>
          <AppText variant="caption" color={colors.moss} style={styles.reasonDetail}>{reason.detail}</AppText>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  emailCard: { marginBottom: spacing.lg, alignItems: 'flex-start', gap: spacing.sm },
  emailButton: { alignSelf: 'stretch' },
  reasonsLabel: { marginBottom: spacing.sm },
  reasonCard: { marginBottom: spacing.sm, borderRadius: radius.lg },
  reasonDetail: { marginTop: 2 },
});
