export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.PDR2_POSTGRES_PASSWORD;
  if (!password) throw new Error('Falta PDR2_POSTGRES_PASSWORD en .env.');
  return `postgres://pdr2:${encodeURIComponent(password)}@127.0.0.1:55432/pdr2_dev`;
}
