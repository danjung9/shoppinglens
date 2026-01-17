import { randomUUID } from "node:crypto";
import { SessionState, ThreadState, SearchSeed, AgentPayload } from "../types.js";

export class SessionStore {
  private sessions = new Map<string, SessionState>();

  getOrCreateSession(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const session: SessionState = {
      session_id: sessionId,
      active_thread_id: undefined,
      threads: new Map<string, ThreadState>(),
      created_at: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  startNewThread(sessionId: string, query: string, searchSeed?: SearchSeed): ThreadState {
    const session = this.getOrCreateSession(sessionId);
    const threadId = randomUUID();
    const thread: ThreadState = {
      thread_id: threadId,
      query,
      search_seed: searchSeed,
      messages: [],
      created_at: new Date().toISOString(),
    };
    session.threads.set(threadId, thread);
    session.active_thread_id = threadId;
    return thread;
  }

  getActiveThread(sessionId: string): ThreadState | undefined {
    const session = this.getOrCreateSession(sessionId);
    if (!session.active_thread_id) return undefined;
    return session.threads.get(session.active_thread_id);
  }

  appendMessage(sessionId: string, threadId: string, payload: AgentPayload): void {
    const session = this.getOrCreateSession(sessionId);
    const thread = session.threads.get(threadId);
    if (!thread) return;
    thread.messages.push(payload);
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
