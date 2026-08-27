import React, { useEffect, useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import type { ReminderConfig } from '../services/api';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
];

// Config-only — web has no local-notification delivery mechanism. Reminders
// created or edited here take effect the next time the mobile app syncs
// (mobile/lib/reminders.ts). Water reminders are unaffected and unchanged;
// they live entirely on the existing Home water-tracking UI.
export const RemindersView: React.FC = () => {
  const [reminders, setReminders] = useState<ReminderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<'shopping_day' | 'custom'>('custom');
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('18:00');
  const [days, setDays] = useState<string[]>([]);

  const load = async () => {
    try {
      const res = await api.getReminders();
      setReminders(res.reminders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleDay = (d: string) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    await api.createReminder({ type, label: label.trim(), time, daysOfWeek: days });
    setLabel('');
    setDays([]);
    await load();
  };

  const handleToggle = async (r: ReminderConfig) => {
    await api.updateReminder(r.id, { enabled: !r.enabled });
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteReminder(id);
    await load();
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-2xl">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Reminders</h1>
            <p className="text-xs text-[#66736A] mt-0.5">Local reminders that fire on your phone. Manage them here or in the mobile app — for water reminders, see Home.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-[#17201A]">New reminder</h2>
        <div className="flex gap-2">
          {(['custom', 'shopping_day'] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${type === t ? 'bg-[#14532D] text-white border-[#14532D]' : 'bg-white text-[#17201A] border-[#E8E5DD]'}`}
            >
              {t === 'custom' ? 'Custom' : 'Shopping Day'}
            </button>
          ))}
        </div>
        <input
          type="text" placeholder="What should it say? (e.g. Buy groceries)" value={label}
          onChange={(e) => setLabel(e.target.value)} required
          className="w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
        />
        <input
          type="time" value={time} onChange={(e) => setTime(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
        />
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map((d) => (
            <button
              key={d.key} type="button" onClick={() => toggleDay(d.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${days.includes(d.key) ? 'bg-[#14532D] text-white border-[#14532D]' : 'bg-white text-[#66736A] border-[#E8E5DD]'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#66736A]">No days selected = fires every day.</p>
        <button type="submit" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14532D] text-white text-sm font-bold">
          <Plus className="w-4 h-4" /> Add reminder
        </button>
      </form>

      {!loading && reminders.length === 0 && (
        <div className="bg-white p-8 rounded-3xl border border-[#E8E5DD] shadow-xs text-center">
          <p className="text-sm text-[#66736A]">No reminders yet.</p>
        </div>
      )}

      {reminders.map((r) => (
        <div key={r.id} className="bg-white p-4 rounded-2xl border border-[#E8E5DD] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-[#17201A]">{r.label}</p>
            <p className="text-xs text-[#66736A]">{r.time} · {r.daysOfWeek.length > 0 ? r.daysOfWeek.join(', ') : 'Every day'} · {r.type === 'shopping_day' ? 'Shopping Day' : 'Custom'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggle(r)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${r.enabled ? 'bg-[#14532D]/10 text-[#14532D]' : 'bg-gray-100 text-gray-500'}`}
            >
              {r.enabled ? 'On' : 'Off'}
            </button>
            <button onClick={() => handleDelete(r.id)} className="text-[#66736A] hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
