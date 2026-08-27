// Conversation history is now persisted server-side (Phase 3B, item 6) —
// /api/ai/chat writes both turns to the existing ai_conversations table,
// and this screen loads them back via GET /api/ai/history on open. The
// Gemini API key never leaves the server; this screen only ever calls the
// existing authenticated endpoints.
import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppText } from '../../../../components/AppText';
import { TextField } from '../../../../components/TextField';
import { Button } from '../../../../components/Button';
import { useFinancialSession } from '../../../../context/FinancialSessionContext';
import { api, ApiError } from '../../../../lib/api';
import { colors, radius, spacing } from '../../../../constants/theme';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function AiAssistantScreen() {
  const { isUnlocked, token } = useFinancialSession();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: 'Habari! Ask me about Kenyan meals, budgeting, or hydration.' },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getAiHistory().then(({ history }) => {
      if (cancelled || history.length === 0) return;
      setMessages(history.map((h) => ({ id: h.id, role: h.role, text: h.content })));
    }).catch(() => { /* non-critical — chat still works without history */ });
    return () => { cancelled = true; };
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    const userMessage: ChatMessage = { id: `u_${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);
    try {
      // Financial context is only ever attached when Budget is actually
      // unlocked right now — same privacy boundary as web, which injects
      // it server-side only when its own session cookie is valid.
      const { reply } = await api.askAI(text, isUnlocked ? (token ?? undefined) : undefined);
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: reply }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sorry, something went wrong. Please try again.';
      setMessages((prev) => [...prev, { id: `e_${Date.now()}`, role: 'assistant', text: message }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.banner}>
        <AppText variant="caption" color={colors.moss}>
          {isUnlocked
            ? 'Budget is unlocked — the assistant can reference your private financial data this session.'
            : 'Budget is locked — the assistant cannot see your income, expenses, or savings.'}
        </AppText>
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
            <AppText variant="body" color={item.role === 'user' ? colors.white : colors.ink}>{item.text}</AppText>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <View style={styles.inputField}>
          <TextField label="" value={input} onChangeText={setInput} placeholder="Ask MLO…" onSubmitEditing={handleSend} />
        </View>
        <Button label="Send" onPress={handleSend} loading={isSending} style={styles.sendButton} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  banner: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  list: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm },
  bubbleUser: { backgroundColor: colors.forest, alignSelf: 'flex-end' },
  bubbleAssistant: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  inputField: { flex: 1 },
  sendButton: { minHeight: 50, paddingHorizontal: spacing.lg },
});
