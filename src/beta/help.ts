import type { HelpTopic } from '../core/registry';

export const betaHelp: HelpTopic[] = [
  {
    id: 'beta-reports',
    title: 'Telling the makers what happened',
    section: 'Getting around',
    media: 'beta-reports.png',
    summary:
      'Write what went wrong and send it, after reading every word of what goes. Frameling counts nothing and sends nothing by itself.',
    keywords: ['report', 'bug', 'beta', 'feedback', 'crash', 'diagnostic', 'diagnostics', 'telemetry', 'privacy', 'send', 'problem', 'broken', 'tester'],
  },
  {
    id: 'crash-notes',
    title: 'When Frameling crashes',
    section: 'Getting around',
    media: 'crash-notes.png',
    summary: 'A dazed Quill meets you after a crash and offers to send the crash notes. You read them first, and nothing goes unless you press Send.',
    keywords: ['crash', 'crashed', 'froze', 'closed badly', 'quit', 'dazed', 'quill', 'notes', 'report', 'diagnostic', 'send', 'broken'],
  },
];
