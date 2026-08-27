// Real notification feed — GET /api/notifications, owner-scoped server-side
// (the notification ownership audit's strict `user_id = auth.uid()` model,
// RLS included, is unchanged by mobile: this screen has no way to see, and
// never attempts to see, another user's notifications). Tapping an unread
// notification marks it read via the same endpoint the web app's bell
// dropdown uses.
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useNotifications, useMarkNotificationRead } from '../../../../hooks/useNotifications';
import { colors, radius, spacing } from '../../../../constants/theme';
import type { NotificationItem } from '../../../../types/domain';

function iconFor(n: NotificationItem): React.ComponentProps<typeof Ionicons>['name'] {
  if (n.data?.accessCode) return 'key';
  if (n.type === 'water') return 'water';
  if (n.type === 'meal') return 'restaurant';
  if (n.type === 'budget') return 'wallet';
  return 'notifications';
}

export default function NotificationsScreen() {
  const { data: notifications, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();

  if (isLoading) return <LoadingState label="Loading notifications…" />;
  if (isError) return <ErrorState message="Could not load notifications." onRetry={refetch} />;
  if (!notifications || notifications.length === 0) {
    return <EmptyState title="No notifications" message="Payment and access-code updates will appear here." />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={notifications}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, !item.isRead && styles.rowUnread]}
          onPress={() => !item.isRead && markRead.mutate(item.id)}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={iconFor(item)} size={18} color={colors.forest} />
          </View>
          <View style={styles.rowText}>
            <View style={styles.titleRow}>
              <AppText variant="bodyBold" style={styles.title}>{item.title}</AppText>
              {!item.isRead ? <View style={styles.dot} /> : null}
            </View>
            <AppText variant="caption" color={colors.moss}>{item.message}</AppText>
            {item.data?.accessCode ? (
              <View style={styles.codeBox}>
                <AppText variant="bodyBold" color={colors.forest}>{item.data.accessCode}</AppText>
                {item.data.expiresAt ? (
                  <AppText variant="caption" color={colors.moss}>
                    Expires {new Date(item.data.expiresAt).toLocaleDateString()}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  rowUnread: { backgroundColor: colors.cream },
  iconWrap: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.forest },
  codeBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.cream, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
});
