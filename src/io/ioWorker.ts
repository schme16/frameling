// Worker thread for the heavy parts of opening and saving (zip, PNG decode). Started by ioClient.ts.
import { runJobAsync, type IoRequest } from './ioJobs';

const scope = self as unknown as { onmessage: ((e: MessageEvent<IoRequest>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
scope.onmessage = (e) => {
  void runJobAsync(e.data).then(({ reply, transfer }) => scope.postMessage(reply, transfer));
};
