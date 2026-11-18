import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExportDialog, { EXPORT_DEFAULTS, formatHint } from '../../src/ui/ExportDialog';

const LANES = [
    { label: 'Order 1042', count: 12 },
    { label: 'Order 1043', count: 4 },
    { label: 'Order 1044', count: 9 },
];

/** Open the dialog, with an export that resolves at once. */
function open(props = {}) {
    const onExport = vi.fn(async () => {});
    const onCancel = vi.fn();
    const utils = render(<ExportDialog onExport={onExport} onCancel={onCancel} {...props} />);
    return { ...utils, onExport, onCancel };
}

describe('ExportDialog', () => {
    it('asks which conversation only with several side by side, the one right-clicked chosen', () => {
        open({ lanes: LANES, lane: 1 });
        expect(screen.getByRole('dialog', { name: 'Export conversation' })).toBeInTheDocument();
        const one = screen.getByRole('radio', { name: /This one: Order 1043/ });
        expect(one).toBeChecked();
        expect(one).toHaveFocus();
        expect(screen.getByRole('radio', { name: 'All 3 shown, side by side' })).not.toBeChecked();
    });

    it('offers all of them when the right-click was not in a lane', () => {
        open({ lanes: LANES, lane: null });
        expect(screen.queryByRole('radio', { name: /This one/ })).toBeNull();
        expect(screen.getByRole('radio', { name: 'All 3 shown, side by side' })).toBeChecked();
    });

    it('does not ask about conversations for one', () => {
        open({ lanes: null });
        expect(screen.queryByRole('group', { name: 'Conversations' })).toBeNull();
        expect(screen.getByRole('radio', { name: 'PDF' })).toBeChecked();
    });

    it('exports the lane chosen, or every lane, in the format chosen', async () => {
        const { onExport } = open({ lanes: LANES, lane: 2 });
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
        expect(onExport.mock.calls[0][0]).toEqual({ ...EXPORT_DEFAULTS, lane: 2 });

        const second = open({ lanes: LANES, lane: 2 });
        fireEvent.click(screen.getAllByRole('radio', { name: 'All 3 shown, side by side' })[1]);
        fireEvent.click(screen.getAllByRole('radio', { name: 'HTML' })[1]);
        fireEvent.click(screen.getAllByRole('button', { name: 'Export' })[1]);
        await waitFor(() => expect(second.onExport).toHaveBeenCalledTimes(1));
        expect(second.onExport.mock.calls[0][0]).toMatchObject({ format: 'html', lane: null });
    });

    it('exports the one conversation on a board as itself', async () => {
        const { onExport } = open({ lanes: [LANES[0]], lane: 0 });
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        await waitFor(() => expect(onExport).toHaveBeenCalled());
        expect(onExport.mock.calls[0][0].lane).toBe(0);
    });

    it('asks about the image only for a PNG', async () => {
        const { onExport } = open({ lanes: null });
        expect(screen.queryByRole('checkbox', { name: 'Transparent background' })).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
        expect(screen.getByRole('radio', { name: 'Slide-sized, 16:9' })).toBeChecked();
        fireEvent.click(screen.getByRole('radio', { name: 'One tall image' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Transparent background' }));
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Title with people, dates and counts' })
        );
        expect(screen.getByText(formatHint('png', 'tall'))).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        await waitFor(() => expect(onExport).toHaveBeenCalled());
        expect(onExport.mock.calls[0][0]).toEqual({
            format: 'png',
            shape: 'tall',
            transparent: true,
            title: false,
            lane: null,
        });
    });

    it('starts from the last choices', () => {
        open({
            lanes: null,
            initial: { format: 'png', shape: 'tall', transparent: true, title: false },
        });
        expect(screen.getByRole('radio', { name: 'PNG' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'One tall image' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Transparent background' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Title/ })).not.toBeChecked();
    });

    it('says which image it is drawing, and takes no second export meanwhile', async () => {
        let finish;
        const onExport = vi.fn(
            (choice, progress) =>
                new Promise((resolve) => {
                    progress(2, 5);
                    finish = resolve;
                })
        );
        render(<ExportDialog lanes={null} onExport={onExport} onCancel={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        expect(await screen.findByText('Drawing image 2 of 5…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        expect(onExport).toHaveBeenCalledTimes(1);
        finish();
    });

    it('closes on Escape and on Cancel, and keeps its keys from the conversation', () => {
        const onRootKey = vi.fn();
        const onCancel = vi.fn();
        render(
            <div onKeyDown={onRootKey}>
                <ExportDialog lanes={null} onExport={async () => {}} onCancel={onCancel} />
            </div>
        );
        fireEvent.keyDown(screen.getByRole('radio', { name: 'PDF' }), { key: 'ArrowDown' });
        expect(onRootKey).not.toHaveBeenCalled();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(2);
    });
});
