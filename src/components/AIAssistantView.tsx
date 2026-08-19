import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bot, Send, User, Lock, Unlock, Shield, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const AIAssistantView: React.FC = () => {
  const { isBudgetUnlocked, setIsPinModalOpen, household } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Habari! I am your **Mlo Wangu Nutrition & Budget Assistant** 🌾.\n\nI can help you plan balanced meals with authentic Kenyan ingredients (sukuma, ndengu, unga, beans), scale recipes for ${household?.name || 'your family'}, and help you live well within your financial means. How can I help you today?`,
      timestamp: 'Just now',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const suggestedPrompts = [
    'I have KSh 300 left today, what dinner can I cook for 5 people?',
    'What are high-protein Kenyan foods on a strict budget?',
    'Healthy breakfast ideas for school children before 7am',
    'How do I swap beef stew with a cheaper legume without losing flavor?',
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsSending(true);

    try {
      const res = await api.askAI(text.trim());
      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'assistant',
        text: res.reply || 'I am ready to help you plan your next healthy Kenyan meal.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: 'Samahani, I ran into an issue connecting. Please try asking again in a moment.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
              <Bot className="w-6 h-6 text-[#14532D]" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">
                Mlo Wangu Nutrition & Budget Assistant
              </h1>
              <p className="text-xs text-[#66736A] mt-0.5">
                Authentic Kenyan food knowledge & localized family budget intelligence
              </p>
            </div>
          </div>

          {/* Privacy status indicator */}
          <div className="flex items-center gap-2">
            {isBudgetUnlocked ? (
              <span className="flex items-center gap-1.5 text-xs bg-[#EFF6FF] text-[#172554] border border-[#BFDBFE] px-3 py-1.5 rounded-xl font-bold">
                <Unlock className="w-3.5 h-3.5 text-[#2563EB]" />
                Budget Context Active
              </span>
            ) : (
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="flex items-center gap-1.5 text-xs bg-[#FAF8F2] text-[#66736A] border border-[#E8E5DD] hover:bg-[#F1EFE8] px-3 py-1.5 rounded-xl font-bold cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-[#14532D]" />
                Financial Data Protected (Click to Unlock)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="bg-white rounded-3xl border border-[#E8E5DD] shadow-xs flex flex-col h-[550px] overflow-hidden">
        {/* Messages list */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-[#14532D] text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#14532D] text-white rounded-tr-xs'
                    : 'bg-[#FAF8F2] text-[#17201A] border border-[#E8E5DD] rounded-tl-xs whitespace-pre-line'
                }`}
              >
                {msg.text}
                <div
                  className={`text-[10px] mt-2 text-right ${
                    msg.sender === 'user' ? 'text-green-200' : 'text-[#66736A]'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-[#172554] text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isSending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#14532D] text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-[#FAF8F2] border border-[#E8E5DD] rounded-2xl p-4 text-xs text-[#66736A] flex items-center gap-2">
                <div className="w-2 h-2 bg-[#14532D] rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-[#14532D] rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-[#14532D] rounded-full animate-bounce [animation-delay:0.4s]" />
                <span>Thinking with Kenyan food knowledge...</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompt Chips */}
        <div className="p-3 bg-[#FAF8F2] border-t border-[#F1EFE8] flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold text-[#66736A] uppercase shrink-0">Try Asking:</span>
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              className="text-[11px] bg-white border border-[#E8E5DD] hover:border-[#14532D] px-2.5 py-1 rounded-xl text-[#17201A] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 bg-white border-t border-[#E8E5DD] flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask anything about Kenyan meal planning, budgeting, or recipes..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isSending}
            className="flex-1 px-4 py-2.5 bg-[#FAF8F2] border border-[#E8E5DD] rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14532D]"
          />
          <button
            type="submit"
            disabled={isSending || !inputMessage.trim()}
            className="p-2.5 bg-[#14532D] text-white rounded-2xl hover:bg-[#0f3e22] transition-all disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
