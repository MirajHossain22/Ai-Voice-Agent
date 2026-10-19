export type CallEvent =
  | { type: 'connected'; timestamp: string }
  | {
      type: 'call.updated';
      callId: string;
      change: 'status' | 'transcript' | 'action' | 'appointment' | 'intent';
      timestamp: string;
    };

type Listener = (event: CallEvent) => void;

export class CallEventBus {
  private readonly listeners = new Set<Listener>();

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public publish(event: CallEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public publishCallUpdate(
    callId: string,
    change: Extract<CallEvent, { type: 'call.updated' }>['change'],
  ): void {
    this.publish({
      type: 'call.updated',
      callId,
      change,
      timestamp: new Date().toISOString(),
    });
  }
}
