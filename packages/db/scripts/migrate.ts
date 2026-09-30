import { prepareDatabase } from '../src/migrate';

prepareDatabase().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Migration failed';
  const cause =
    error instanceof Error && 'cause' in error && error.cause instanceof Error
      ? `\n${error.cause.message}`
      : '';
  process.stderr.write(`${message}${cause}\n`);
  process.exit(1);
});
