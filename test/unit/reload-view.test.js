import { describe, it, expect } from 'vitest';
import { reloadingView } from '../../src/ui/reload-view';

const previous = {
    conversation: { messages: [{ id: '1' }] },
    settings: { order: 'oldest' },
    canSelect: true,
    onSelect: () => {},
    rect: { width: 400, height: 300 },
    keyboard: { enabled: false },
    layout: { qHyperCube: {} },
    reloading: null,
};

describe('reloadingView', () => {
    it('keeps the conversation that was on screen while newer rows load', () => {
        const rect = { width: 800, height: 600 };
        const keyboard = { enabled: true, active: true };
        const view = reloadingView(previous, { rect, keyboard, progress: null });
        expect(view.conversation).toBe(previous.conversation);
        expect(view.settings).toBe(previous.settings);
        // The object may have been resized or focused meanwhile.
        expect(view.rect).toBe(rect);
        expect(view.keyboard).toBe(keyboard);
        expect(view.reloading).toEqual({ loaded: null, total: null });
    });

    it('turns selecting off, since the new selection may have removed the message clicked', () => {
        expect(reloadingView(previous, {}).canSelect).toBe(false);
    });

    it('passes on the paging progress when it is known', () => {
        const view = reloadingView(previous, { progress: { loaded: 2000, total: 12000 } });
        expect(view.reloading).toEqual({ loaded: 2000, total: 12000 });
    });

    it('asks for Loading when no conversation was on screen', () => {
        expect(reloadingView(null, {})).toBeNull();
        expect(reloadingView({ settings: {} }, {})).toBeNull();
    });
});
