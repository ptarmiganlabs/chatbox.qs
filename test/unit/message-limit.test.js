import { describe, it, expect } from 'vitest';
import { readsFromEnd } from '../../src/chat/message-limit';

describe('readsFromEnd', () => {
    it('reads the last rows for Newest first, so the limit keeps the newest messages', () => {
        expect(readsFromEnd({ order: 'newest' })).toBe(true);
    });

    it('reads the last rows with conversations side by side, in either order', () => {
        expect(readsFromEnd({ order: 'oldest', lanes: { show: true } })).toBe(true);
        expect(readsFromEnd({ order: 'newest', lanes: { show: true } })).toBe(true);
    });

    it('reads from the first row for Oldest first without lanes', () => {
        expect(readsFromEnd({ order: 'oldest', lanes: { show: false } })).toBe(false);
        expect(readsFromEnd({ order: 'oldest' })).toBe(false);
    });

    it('reads from the first row for an object saved before these settings existed', () => {
        expect(readsFromEnd({})).toBe(false);
        expect(readsFromEnd(undefined)).toBe(false);
        expect(readsFromEnd({ lanes: { show: 'yes' } })).toBe(false);
    });
});
