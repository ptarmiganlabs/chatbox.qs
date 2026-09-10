import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DetailReveal from '../../src/ui/DetailReveal';

const msg = (over = {}) => ({
    id: 'm1',
    elem: 1,
    body: 'Morning — did the reload finish?',
    bodyFormat: 'text',
    author: { key: 'Ada', elem: 10, label: 'Ada Lovelace', color: '#4477aa', side: 'left' },
    ts: 1757318400000,
    tsText: '08:12',
    threadId: 'T1',
    kind: 'text',
    media: [],
    accent: null,
    badge: null,
    kpis: [],
    state: 'O',
    rowIdx: 0,
    merged: false,
    rowCount: 1,
    side: 'left',
    ...over,
});

describe('DetailReveal', () => {
    it('shows the message and its facts', () => {
        render(
            <DetailReveal
                message={msg()}
                messages={[msg()]}
                index={0}
                mode="pane"
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText('Morning — did the reload finish?')).toBeInTheDocument();
        expect(screen.getByText('08:12')).toBeInTheDocument();
        expect(screen.getByText('T1')).toBeInTheDocument();
        // Named once, in the header — not repeated as a fact underneath it.
        expect(screen.getAllByText('Ada Lovelace')).toHaveLength(1);
        expect(screen.queryByText('Participant')).not.toBeInTheDocument();
    });

    it('names the participant inline, where there is no header to do it', () => {
        render(
            <DetailReveal
                message={msg()}
                messages={[msg()]}
                index={0}
                mode="inline"
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText('Participant')).toBeInTheDocument();
        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    });

    it('omits facts that have no value rather than showing blanks', () => {
        render(
            <DetailReveal
                message={msg({ threadId: null, kind: null, tsText: null })}
                messages={[msg()]}
                index={0}
                mode="pane"
                onClose={vi.fn()}
            />
        );
        expect(screen.queryByText('Thread')).not.toBeInTheDocument();
        expect(screen.queryByText('Kind')).not.toBeInTheDocument();
    });

    it('closes from the header in pane and overlay modes', () => {
        const onClose = vi.fn();
        render(
            <DetailReveal
                message={msg()}
                messages={[msg()]}
                index={0}
                mode="overlay"
                onClose={onClose}
            />
        );
        fireEvent.click(screen.getByLabelText('Close details'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes from the inline affordance, which has no header', () => {
        const onClose = vi.fn();
        render(
            <DetailReveal
                message={msg()}
                messages={[msg()]}
                index={0}
                mode="inline"
                onClose={onClose}
            />
        );
        expect(screen.queryByLabelText('Close details')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('explains a merged bubble in the detail too', () => {
        render(
            <DetailReveal
                message={msg({ merged: true, rowCount: 3 })}
                messages={[msg()]}
                index={0}
                mode="pane"
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText(/combines 3 messages/)).toBeInTheDocument();
    });

    describe('KPIs', () => {
        const withKpi = (num) =>
            msg({ kpis: [{ key: 'k', label: 'Sentiment', text: String(num), num }] });

        it('renders a KPI with its label and value', () => {
            render(
                <DetailReveal
                    message={withKpi(0.82)}
                    messages={[withKpi(0.1), withKpi(0.82), withKpi(0.5)]}
                    index={1}
                    mode="pane"
                    onClose={vi.fn()}
                />
            );
            expect(screen.getByText('Sentiment')).toBeInTheDocument();
            expect(screen.getByText('0.82')).toBeInTheDocument();
            expect(screen.getByRole('img', { name: /Sentiment/ })).toBeInTheDocument();
        });

        it('omits the sparkline when the conversation is too short to trend', () => {
            render(
                <DetailReveal
                    message={withKpi(0.82)}
                    messages={[withKpi(0.82)]}
                    index={0}
                    mode="pane"
                    onClose={vi.fn()}
                />
            );
            expect(screen.getByText('Sentiment')).toBeInTheDocument();
            expect(screen.queryByRole('img')).not.toBeInTheDocument();
        });

        it('shows a dash for a KPI with no value', () => {
            render(
                <DetailReveal
                    message={msg({ kpis: [{ key: 'k', label: 'Sentiment', text: '', num: null }] })}
                    messages={[msg()]}
                    index={0}
                    mode="pane"
                    onClose={vi.fn()}
                />
            );
            expect(screen.getByText('—')).toBeInTheDocument();
        });
    });

    it('reports media as unsupported rather than pretending to render it', () => {
        render(
            <DetailReveal
                message={msg({ media: [{ ref: 'a.png', kind: 'image', caption: null }] })}
                messages={[msg()]}
                index={0}
                mode="pane"
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText(/1 attachment.*not yet supported/)).toBeInTheDocument();
    });
});
