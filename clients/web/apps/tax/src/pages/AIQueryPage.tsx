/**
 * AI Tax Assistant Page
 *
 * AI-powered query interface for tax-related questions.
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth, apiConfig } from '@tamshai/auth';
import { ApprovalCard } from '@tamshai/ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PendingConfirmation {
  confirmationId: string;
  message: string;
}

const EXAMPLE_QUERIES = [
  'What is my quarterly estimate for Q1?',
  'Show me the sales tax rate for California',
  'When are my next tax deadlines?',
  'What filings are pending for 2025?',
];

export function AIQueryPage() {
  const { getAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: userMessage.content, domain: 'tax' }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // Check for pending confirmation
              if (parsed.type === 'pending_confirmation') {
                setPendingConfirmation({
                  confirmationId: parsed.confirmationId,
                  message: parsed.message,
                });
                continue;
              }

              // Handle content delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? { ...msg, content: msg.content + parsed.delta.text }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmation = async (approved: boolean) => {
    if (!pendingConfirmation) return;

    try {
      const token = await getAccessToken();
      await fetch(`${apiConfig.mcpGatewayUrl}/api/confirm/${pendingConfirmation.confirmationId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approved }),
      });

      const resultMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: approved ? 'Action confirmed and executed.' : 'Action cancelled.',
      };
      setMessages((prev) => [...prev, resultMessage]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingConfirmation(null);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">AI Tax Assistant</h1>
        <p className="text-gray-500 mt-1">Ask questions about your tax data</p>
      </div>

      {/* Example Queries */}
      {messages.length === 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Try asking about:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((example, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {example.includes('quarterly estimate') ? 'Quarterly estimate' : example.split(' ').slice(0, 4).join(' ')}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="spinner"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {pendingConfirmation && (
          <ApprovalCard
            message={pendingConfirmation.message}
            onComplete={handleConfirmation}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about tax rates, estimates, filings..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default AIQueryPage;
