/**
 * Chat Store (Zustand)
 *
 * State management for chat messages and AI interactions.
 * Handles SSE streaming, confirmations, and message history.
 */

import { create } from 'zustand';
import { ChatMessage } from '../types';
import * as apiService from '../services/api';
import { getAccessToken } from './authStore';

/**
 * Generate a cryptographically secure UUID v4
 * Uses crypto.getRandomValues() when available for security
 * Falls back to timestamp + counter for React Native environments without crypto
 */
let _counter = 0;
function generateId(): string {
  // Try crypto.randomUUID first (modern browsers/Node 19+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Try crypto.getRandomValues (most environments)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version (4) and variant (RFC4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Fallback: timestamp + counter (for RN environments without crypto)
  // This is less secure but unique enough for message IDs
  const timestamp = Date.now().toString(16);
  const counter = (++_counter).toString(16).padStart(4, '0');
  const random = Math.random().toString(16).slice(2, 10);
  return `${timestamp.slice(-8)}-${counter}-4${random.slice(0, 3)}-8${random.slice(3, 6)}-${random}${timestamp.slice(0, 4)}`;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  currentStreamingId: string | null;
}

interface ChatActions {
  sendMessage: (content: string) => Promise<void>;
  confirmAction: (confirmationId: string, approved: boolean) => Promise<void>;
  clearMessages: () => void;
  cancelStream: () => void;
}

interface ChatStore extends ChatState, ChatActions {}

// AbortController for cancelling streams
let streamAbortController: AbortController | null = null;

export const useChatStore = create<ChatStore>((set, _get) => ({
  // Initial state
  messages: [],
  isStreaming: false,
  error: null,
  currentStreamingId: null,

  // Actions
  sendMessage: async (content: string) => {
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      set({ error: 'Failed to get access token' });
      return;
    }

    if (!accessToken) {
      set({ error: 'Not authenticated. Please log in.' });
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Create placeholder for assistant response
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
      currentStreamingId: assistantId,
    }));

    // Setup abort controller
    streamAbortController = new AbortController();

    try {
      await apiService.streamQuery(
        content,
        accessToken,
        // onChunk - update streaming message
        (text: string) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + text }
                : msg
            ),
          }));
        },
        // onComplete - finalize message
        (completeMessage: ChatMessage) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? {
                    ...completeMessage,
                    id: assistantId,
                    isStreaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            currentStreamingId: null,
          }));
          streamAbortController = null;
        },
        // onError
        (error: Error) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: msg.content || 'Sorry, an error occurred.',
                    isStreaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            error: error.message,
            currentStreamingId: null,
          }));
          streamAbortController = null;
        },
        streamAbortController.signal
      );
    } catch (error) {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: msg.content || 'Failed to connect to AI service.',
                isStreaming: false,
              }
            : msg
        ),
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        currentStreamingId: null,
      }));
      streamAbortController = null;
    }
  },

  confirmAction: async (confirmationId: string, approved: boolean) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      set({ error: 'Not authenticated. Please log in.' });
      return;
    }

    try {
      const result = await apiService.confirmAction(confirmationId, approved, accessToken);

      // Update the message with confirmation result
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.pendingConfirmation?.confirmationId === confirmationId
            ? {
                ...msg,
                pendingConfirmation: {
                  ...msg.pendingConfirmation,
                  approved,
                },
                content: approved
                  ? `${msg.content}\n\n**Action confirmed.** ${result.status === 'success' ? 'Operation completed successfully.' : ''}`
                  : `${msg.content}\n\n**Action cancelled.**`,
              }
            : msg
        ),
        error: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Confirmation failed',
      });
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      error: null,
    });
  },

  cancelStream: () => {
    if (streamAbortController) {
      streamAbortController.abort();
      streamAbortController = null;
    }

    set((state) => ({
      isStreaming: false,
      messages: state.messages.map((msg) =>
        msg.id === state.currentStreamingId
          ? { ...msg, isStreaming: false, content: msg.content || '(Cancelled)' }
          : msg
      ),
      currentStreamingId: null,
    }));
  },
}));
