import { describe, it, expect } from 'vitest';
import definition from '../../../src/object-properties';
import {
    HIGHLIGHT_LIMIT_MAX,
    TEXT_TOOL_DEFAULTS,
    clampHighlightLimit,
    normalizeColorExpression,
    readTextToolSettings,
    textToolSettingsBag,
} from '../../../src/highlight/settings';

describe('readTextToolSettings', () => {
    it('returns the defaults for a bag without settings, as an object saved before they existed', () => {
        expect(readTextToolSettings(undefined)).toEqual(TEXT_TOOL_DEFAULTS);
        expect(readTextToolSettings({ order: 'oldest' })).toEqual(TEXT_TOOL_DEFAULTS);
    });

    it('keeps valid values', () => {
        const bag = {
            highlight: {
                field: 'match',
                possibleWhenNoneSelected: false,
                limit: 250,
                clickToSelect: false,
                showSummary: false,
            },
            match: { caseSensitive: true, wholeValues: false, flexibleWhitespace: false },
            category: {
                field: 'pattern',
                colorExpression: 'Red()',
                showLegend: false,
                showLabels: true,
            },
        };
        expect(readTextToolSettings(bag)).toEqual(bag);
    });

    it('falls back to the defaults for values of the wrong type', () => {
        const settings = readTextToolSettings({
            highlight: {
                field: 42,
                possibleWhenNoneSelected: 'yes',
                limit: 'lots',
                showSummary: 1,
            },
            match: { caseSensitive: 'true', wholeValues: null },
            category: { field: null, colorExpression: {}, showLegend: 0, showLabels: 'on' },
        });
        expect(settings).toEqual(TEXT_TOOL_DEFAULTS);
    });

    it('reads field names without the brackets an author may have typed', () => {
        const settings = readTextToolSettings({
            highlight: { field: '[odd]]name]' },
            category: { field: ' [pattern] ' },
        });
        expect(settings.highlight.field).toBe('odd]name');
        expect(settings.category.field).toBe('pattern');
    });
});

describe('clampHighlightLimit', () => {
    it('keeps the limit a whole number from 1 to the maximum', () => {
        expect(clampHighlightLimit(0)).toBe(1);
        expect(clampHighlightLimit(-5)).toBe(1);
        expect(clampHighlightLimit(12.4)).toBe(12);
        expect(clampHighlightLimit('300')).toBe(300);
        expect(clampHighlightLimit(250000)).toBe(HIGHLIGHT_LIMIT_MAX);
    });

    it('caps the limit at the engine budget of 10,000 cells per call', () => {
        expect(HIGHLIGHT_LIMIT_MAX).toBe(10_000);
    });

    it('falls back to the default limit for something that is not a number', () => {
        expect(clampHighlightLimit('')).toBe(TEXT_TOOL_DEFAULTS.highlight.limit);
        expect(clampHighlightLimit(undefined)).toBe(TEXT_TOOL_DEFAULTS.highlight.limit);
        expect(clampHighlightLimit('lots')).toBe(TEXT_TOOL_DEFAULTS.highlight.limit);
    });
});

describe('normalizeColorExpression', () => {
    it('drops the leading "=" an author types in front of a colour expression', () => {
        expect(normalizeColorExpression("  =If(pattern = 'isbn', Red()) ")).toBe(
            "If(pattern = 'isbn', Red())"
        );
        expect(normalizeColorExpression('Red()')).toBe('Red()');
        expect(normalizeColorExpression(undefined)).toBe('');
    });
});

describe('textToolSettingsBag', () => {
    it('is a mutable copy of the defaults', () => {
        const bag = textToolSettingsBag();
        expect(bag).toEqual(TEXT_TOOL_DEFAULTS);
        bag.highlight.field = 'match';
        expect(TEXT_TOOL_DEFAULTS.highlight.field).toBe('');
    });

    it('is what a new object starts with, next to the existing settings', () => {
        expect(definition.chatbox).toMatchObject(TEXT_TOOL_DEFAULTS);
        expect(definition.chatbox.order).toBe('oldest');
    });
});
