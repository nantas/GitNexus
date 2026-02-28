import { closeKuzu } from '../mcp/core/kuzu-adapter.js';
import { LocalBackend } from '../mcp/local/local-backend.js';

export async function createToolRunner() {
  const backend = new LocalBackend();
  const ok = await backend.init();
  if (!ok) {
    throw new Error('No indexed repositories found. Run analyze first.');
  }

  return {
    query: (params: any) => backend.callTool('query', params),
    context: (params: any) => backend.callTool('context', params),
    impact: (params: any) => backend.callTool('impact', params),
    close: async () => {
      await closeKuzu();
    },
  };
}
