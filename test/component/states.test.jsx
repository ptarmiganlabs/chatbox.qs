import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotConfigured, emptyStateMessage } from '../../src/ui/states';

describe('NotConfigured', () => {
    it('asks for a Participant dimension in the participant model', () => {
        render(<NotConfigured missing={['author']} />);
        expect(screen.getByText(/a Participant dimension/)).toBeInTheDocument();
        // Human names, not role ids.
        expect(screen.getByText('Missing: Participant')).toBeInTheDocument();
    });

    it('asks for From and To dimensions in the From → To model', () => {
        render(<NotConfigured missing={['recipient']} conversationModel="fromTo" />);
        expect(screen.getByText(/a From and a To dimension/)).toBeInTheDocument();
        expect(screen.getByText('Missing: To')).toBeInTheDocument();
    });

    it('shows what each dimension currently is, so a model switch is explicable', () => {
        render(
            <NotConfigured
                missing={['recipient']}
                conversationModel="fromTo"
                assigned={[
                    { label: 'Message ID', column: 'MsgId' },
                    { label: 'Conversation', column: 'ChatId' },
                ]}
            />
        );
        expect(
            screen.getByText('Assigned: Message ID = MsgId · Conversation = ChatId')
        ).toBeInTheDocument();
    });
});

describe('emptyStateMessage', () => {
    const conversation = (meta) => ({ messages: [], meta });

    it('prefers the app author’s calculation-condition message', () => {
        expect(
            emptyStateMessage(conversation({ phantomRows: 3, rowsLoaded: 3 }), 'Pick a chat')
        ).toBe('Pick a chat');
    });

    it('explains a cube whose every row was a phantom', () => {
        expect(emptyStateMessage(conversation({ phantomRows: 3, rowsLoaded: 3 }), null)).toMatch(
            /3 row\(s\), but none of them is a message/
        );
    });

    it('falls back to the default text otherwise', () => {
        expect(emptyStateMessage(conversation({ phantomRows: 0, rowsLoaded: 0 }), null)).toBeNull();
        expect(emptyStateMessage(undefined, null)).toBeNull();
    });
});
