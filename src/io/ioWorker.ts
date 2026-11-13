// Worker thread for the heavy parts of opening and saving (zip, PNG decode). Started by ioClient.ts.
import { runJob, type IoRequest } from './ioJobs';

const scope = self as unknown as { onmessage: ((e: MessageEvent<IoRequest>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
scope.onmessage = (e) => {
  const { reply, transfer } = runJob(e.data);
  scope.postMessage(reply, transfer);
};
