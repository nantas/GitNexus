import { afterEach, describe, expect, it } from 'vitest';
import { env } from '@huggingface/transformers';
import {
  configureTransformersEnvironment,
  normalizeBooleanEnv,
  normalizeRemoteHost,
} from '../../src/core/embeddings/embedder.js';
import { getEmbeddingNodeLimit } from '../../src/cli/analyze.js';

const originalEnv = { ...process.env };
const originalTransformersEnv = {
  allowLocalModels: env.allowLocalModels,
  allowRemoteModels: env.allowRemoteModels,
  cacheDir: env.cacheDir,
  localModelPath: env.localModelPath,
  remoteHost: env.remoteHost,
};

afterEach(() => {
  process.env = { ...originalEnv };
  env.allowLocalModels = originalTransformersEnv.allowLocalModels;
  env.allowRemoteModels = originalTransformersEnv.allowRemoteModels;
  env.cacheDir = originalTransformersEnv.cacheDir;
  env.localModelPath = originalTransformersEnv.localModelPath;
  env.remoteHost = originalTransformersEnv.remoteHost;
});

describe('embedding runtime configuration', () => {
  it('normalizes boolean environment values', () => {
    expect(normalizeBooleanEnv('true')).toBe(true);
    expect(normalizeBooleanEnv('ON')).toBe(true);
    expect(normalizeBooleanEnv('0')).toBe(false);
    expect(normalizeBooleanEnv('no')).toBe(false);
    expect(normalizeBooleanEnv('maybe')).toBeUndefined();
  });

  it('normalizes Hugging Face compatible endpoint URLs', () => {
    expect(normalizeRemoteHost('https://hf-mirror.com')).toBe('https://hf-mirror.com/');
    expect(normalizeRemoteHost('https://huggingface.co/')).toBe('https://huggingface.co/');
  });

  it('applies cache, mirror, local path, and offline env overrides', () => {
    process.env.GITNEXUS_TRANSFORMERS_CACHE = '/tmp/gitnexus-transformers-cache';
    process.env.GITNEXUS_TRANSFORMERS_LOCAL_MODEL_PATH = '/models';
    process.env.GITNEXUS_HF_ENDPOINT = 'https://hf-mirror.com';
    process.env.GITNEXUS_TRANSFORMERS_LOCAL_ONLY = '1';

    configureTransformersEnvironment();

    expect(env.cacheDir).toBe('/tmp/gitnexus-transformers-cache');
    expect(env.localModelPath).toBe('/models');
    expect(env.remoteHost).toBe('https://hf-mirror.com/');
    expect(env.allowLocalModels).toBe(true);
    expect(env.allowRemoteModels).toBe(false);
  });

  it('keeps the default embedding node limit unless explicitly overridden', () => {
    delete process.env.GITNEXUS_EMBEDDING_NODE_LIMIT;
    delete process.env.GITNEXUS_EMBEDDING_MAX_NODES;
    expect(getEmbeddingNodeLimit()).toBe(50_000);

    process.env.GITNEXUS_EMBEDDING_NODE_LIMIT = '0';
    expect(getEmbeddingNodeLimit()).toBe(Number.POSITIVE_INFINITY);

    process.env.GITNEXUS_EMBEDDING_NODE_LIMIT = '123456';
    expect(getEmbeddingNodeLimit()).toBe(123_456);
  });
});
