export const createSchemaOrThrow = async (
  schemaQueries: readonly string[],
  execute: (query: string) => Promise<unknown>,
): Promise<void> => {
  for (const [index, schemaQuery] of schemaQueries.entries()) {
    try {
      await execute(schemaQuery);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists')) continue;
      throw new Error(`LadybugDB schema creation failed at statement ${index + 1}: ${message}`, { cause: error });
    }
  }
};
