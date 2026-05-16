'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AiChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistant = '';

      setMessages(m => [...m, { role: 'assistant', content: '' }]);

      if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            assistant += chunk;
            setMessages(m => [
              ...m.slice(0, -1),
              { role: 'assistant', content: assistant },
            ]);
          }
        }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open AI assistant"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 50,
        }}
      >
        {open ? '✕' : '✦'}
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 24,
            width: 360,
            maxHeight: '70dvh',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(10,10,18,0.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            zIndex: 50,
            overflow: 'hidden',
            fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              fontWeight: 600,
              color: '#e5e7eb',
              flexShrink: 0,
            }}
          >
            NoBC AI
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 24 }}>
                Ask about members, events, or applications.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                  color: '#f3f4f6',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === '' && (
              <div style={{ alignSelf: 'flex-start', color: '#6b7280', fontSize: 13 }}>…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="Ask anything…"
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#f3f4f6',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                fontSize: 13,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
