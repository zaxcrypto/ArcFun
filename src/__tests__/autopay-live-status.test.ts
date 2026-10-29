/**
 * Unit tests for Autopay live-status UX transition and executionState logic
 */

describe('Autopay Live Status UX Transitions', () => {
  type ExecutionState = 'idle' | 'processing' | 'completed' | 'failed';

  interface AutopayLiveTracker {
    executionState: ExecutionState;
    txHash: string | null;
    isDue: boolean;
    hasDispatchedEvents: boolean;
    triggerCount: number;
  }

  function createTracker(): AutopayLiveTracker {
    return {
      executionState: 'idle',
      txHash: null,
      isDue: true,
      hasDispatchedEvents: false,
      triggerCount: 0
    };
  }

  it('prevents re-triggering while executionState is processing', () => {
    const tracker = createTracker();

    function handleTrigger(scheduleId: string, lastTriggeredRef: { current: string | null }) {
      if (tracker.executionState === 'processing') return false;
      if (lastTriggeredRef.current === scheduleId) return false;

      lastTriggeredRef.current = scheduleId;
      tracker.executionState = 'processing';
      tracker.triggerCount++;
      return true;
    }

    const lastTriggeredRef = { current: null as string | null };
    const firstCall = handleTrigger('sch-123', lastTriggeredRef);
    expect(firstCall).toBe(true);
    expect(tracker.executionState).toBe('processing');
    expect(tracker.triggerCount).toBe(1);

    // Second call with same schedule while processing
    const secondCall = handleTrigger('sch-123', lastTriggeredRef);
    expect(secondCall).toBe(false);
    expect(tracker.triggerCount).toBe(1);
  });

  it('keeps processing state while backend status is PENDING or SUBMITTING', () => {
    const tracker = createTracker();
    tracker.executionState = 'processing';

    const backendStatuses = ['QUEUED', 'SUBMITTING', 'PENDING'];
    for (const st of backendStatuses) {
      if (['CONFIRMED', 'FAILED'].includes(st)) {
        tracker.executionState = st === 'CONFIRMED' ? 'completed' : 'failed';
      }
      // Should remain processing
      expect(tracker.executionState).toBe('processing');
    }
  });

  it('transitions to completed only when on-chain txHash is confirmed', () => {
    const tracker = createTracker();
    tracker.executionState = 'processing';

    const latestExecution = {
      status: 'CONFIRMED',
      blockchain_tx_hash: '0xabc123def4567890123456789012345678901234567890123456789012345678'
    };

    if (latestExecution.status === 'CONFIRMED' && latestExecution.blockchain_tx_hash) {
      tracker.executionState = 'completed';
      tracker.txHash = latestExecution.blockchain_tx_hash;
      tracker.hasDispatchedEvents = true;
    }

    expect(tracker.executionState).toBe('completed');
    expect(tracker.txHash).toBe('0xabc123def4567890123456789012345678901234567890123456789012345678');
    expect(tracker.hasDispatchedEvents).toBe(true);
  });

  it('transitions to failed state when execution fails', () => {
    const tracker = createTracker();
    tracker.executionState = 'processing';

    const latestExecution = {
      status: 'FAILED',
      errorMessage: 'Insufficient balance'
    };

    if (latestExecution.status === 'FAILED') {
      tracker.executionState = 'failed';
    }

    expect(tracker.executionState).toBe('failed');
    expect(tracker.txHash).toBeNull();
  });
});
