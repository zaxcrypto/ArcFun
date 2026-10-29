export type EventName = 
  | 'portfolio:refresh_requested'
  | 'transaction:success'
  | 'message:new'
  | 'message:edited'
  | 'message:deleted'
  | 'message:seen'
  | 'conversation:updated';

export type EventHandler = (data?: any) => void;

class EventBus {
  private listeners: Record<string, EventHandler[]> = {};

  on(event: EventName, handler: EventHandler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event: EventName, handler: EventHandler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  emit(event: EventName, data?: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(h => h(data));
  }
}

export const globalEventBus = new EventBus();
