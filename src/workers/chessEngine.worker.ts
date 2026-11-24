import { ProChessEngine, type RawSearchSnapshot, type SearchOptions } from '../engine/proChessEngine';

const engine = new ProChessEngine();

export interface EngineWorkerRequest {
  id: number;
  type: 'search' | 'stop';
  fen?: string;
  options?: SearchOptions;
}

export interface EngineWorkerResponse {
  id: number;
  type: 'progress' | 'done' | 'error';
  snapshot?: RawSearchSnapshot;
  error?: string;
}

self.onmessage = (ev: MessageEvent<EngineWorkerRequest>) => {
  const msg = ev.data;
  if (!msg) return;

  if (msg.type === 'stop') {
    engine.stop();
    return;
  }

  if (msg.type === 'search' && msg.fen) {
    try {
      const result = engine.search(msg.fen, msg.options || {}, (progressSnap) => {
        const payload: EngineWorkerResponse = {
          id: msg.id,
          type: 'progress',
          snapshot: progressSnap,
        };
        self.postMessage(payload);
      });
      const donePayload: EngineWorkerResponse = {
        id: msg.id,
        type: 'done',
        snapshot: result,
      };
      self.postMessage(donePayload);
    } catch (err) {
      const errPayload: EngineWorkerResponse = {
        id: msg.id,
        type: 'error',
        error: err instanceof Error ? err.message : 'Satranç motoru arama hatası',
      };
      self.postMessage(errPayload);
    }
  }
};
