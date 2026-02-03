import { randomUUID } from "node:crypto";
export class SessionStore {
    sessions = new Map();
    getOrCreateSession(sessionId) {
        const existing = this.sessions.get(sessionId);
        if (existing)
            return existing;
        const session = {
            session_id: sessionId,
            active_thread_id: undefined,
            threads: new Map(),
            created_at: new Date().toISOString(),
        };
        this.sessions.set(sessionId, session);
        return session;
    }
    startNewThread(sessionId, query, searchSeed) {
        const session = this.getOrCreateSession(sessionId);
        const threadId = randomUUID();
        const thread = {
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
    getActiveThread(sessionId) {
        const session = this.getOrCreateSession(sessionId);
        if (!session.active_thread_id)
            return undefined;
        return session.threads.get(session.active_thread_id);
    }
    appendMessage(sessionId, threadId, payload) {
        const session = this.getOrCreateSession(sessionId);
        const thread = session.threads.get(threadId);
        if (!thread)
            return;
        thread.messages.push(payload);
    }
    endSession(sessionId) {
        this.sessions.delete(sessionId);
    }
}
