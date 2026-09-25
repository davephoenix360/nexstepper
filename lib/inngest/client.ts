import { Inngest, eventType } from 'inngest';

// Define events as TypeScript types — Inngest v4 uses `eventType()` helper
// instead of an EventSchemas registry. See:
// https://www.inngest.com/docs/learn/scheduling
export type AppEvents = {
  'app/test': { data: { message: string } };
};

export const inngest = new Inngest({
  id: 'nexstepper'
});

/**
 * Test event used during Phase 0 to verify the Inngest dev server connection.
 * Safe to delete once real events land in Phase 1.
 */
export const testEvent = inngest.createFunction(
  { id: 'test-event', triggers: [eventType('app/test')] },
  async ({ event, step }) => {
    await step.run('echo', async () => event.data.message);
    return { echoed: event.data.message, at: new Date().toISOString() };
  }
);

export const functions = [testEvent];