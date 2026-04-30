/**
 * Embedder Module (Read-Only)
 *
 * MCP only needs query embeddings, but it must use the same model loading,
 * cache, mirror, and device probing behavior as the CLI indexer. Keeping this
 * as a thin wrapper prevents CLI-generated vectors and MCP query vectors from
 * drifting across different runtime configuration paths.
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import {
  embedText,
  initEmbedder as initSharedEmbedder,
  isEmbedderReady as isSharedEmbedderReady,
} from '../../core/embeddings/embedder.js';
import { DEFAULT_EMBEDDING_CONFIG } from '../../core/embeddings/types.js';

const EMBEDDING_DIMS = DEFAULT_EMBEDDING_CONFIG.dimensions;

/**
 * Initialize the embedding model (lazy, on first search)
 */
export const initEmbedder = async (): Promise<FeatureExtractionPipeline> => {
  console.error('GitNexus: Loading embedding model (first search may take a moment)...');
  const embedder = await initSharedEmbedder();
  console.error('GitNexus: Embedding model loaded');
  return embedder;
};

/**
 * Check if embedder is ready
 */
export const isEmbedderReady = (): boolean => isSharedEmbedderReady();

/**
 * Embed a query text for semantic search
 */
export const embedQuery = async (query: string): Promise<number[]> => {
  await initEmbedder();
  const result = await embedText(query);
  return Array.from(result);
};

/**
 * Get embedding dimensions
 */
export const getEmbeddingDims = (): number => EMBEDDING_DIMS;

/**
 * Cleanup embedder
 */
export const disposeEmbedder = async (): Promise<void> => {
  // Shared CLI/MCP embedder does not expose a public dispose hook yet.
  // Keep this function for the existing MCP contract.
};
