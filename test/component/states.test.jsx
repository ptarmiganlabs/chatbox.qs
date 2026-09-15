import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotConfigured } from '../../src/ui/states';

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
