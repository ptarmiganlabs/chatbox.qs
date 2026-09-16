import { describe, it, expect } from 'vitest';
import { counted, formatCount } from '../../src/util/format';

describe('formatCount and counted', () => {
    it('groups digits the same way on every host', () => {
        expect(formatCount(20017)).toBe('20,017');
        expect(formatCount(0)).toBe('0');
    });

    it('picks the noun for one or for any other count', () => {
        expect(counted(1, 'highlight', 'highlights')).toBe('1 highlight');
        expect(counted(0, 'highlight', 'highlights')).toBe('0 highlights');
        expect(counted(2345, 'message', 'messages')).toBe('2,345 messages');
    });
});
