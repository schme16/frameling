// Types for the pieces of hyperdht that the tests reach for. Hyperswarm ships none of its own, and the page of it that
// Frameling uses is described by SwarmLike in swarm.ts.
declare module 'hyperdht/testnet' {
  const createTestnet: (size?: number, opts?: Record<string, unknown>) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
  export default createTestnet;
}
