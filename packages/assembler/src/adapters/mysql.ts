import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function createPool(): Pool {
  const connectionString = process.env.MYSQL_URL;
  const url = connectionString ? new URL(connectionString) : null;
  if (url && url.protocol !== "mysql:") {
    throw new Error("MYSQL_URL은 mysql:// 형식이어야 합니다.");
  }
  const host = url?.hostname || process.env.MYSQL_HOST;
  const user = url
    ? decodeURIComponent(url.username)
    : process.env.MYSQL_USER;
  const database = url
    ? url.pathname.replace(/^\//, "")
    : process.env.MYSQL_DATABASE;
  if (!host || !user || !database) {
    throw new Error(
      "MYSQL_URL 또는 MYSQL_HOST·MYSQL_USER·MYSQL_DATABASE가 필요합니다.",
    );
  }
  return mysql.createPool({
    host,
    port: Number(url?.port || process.env.MYSQL_PORT || 3306),
    user,
    password: url
      ? decodeURIComponent(url.password)
      : process.env.MYSQL_PASSWORD,
    database,
    connectionLimit: Math.max(2, Number(process.env.MYSQL_POOL_SIZE || 8)),
    waitForConnections: true,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    ssl: process.env.MYSQL_SSL === "true" ? {} : undefined,
  });
}

export async function getMySqlPool(): Promise<Pool> {
  pool ||= createPool();
  schemaReady ||= pool
    .query(`
      CREATE TABLE IF NOT EXISTS ink_documents (
        path_hash BINARY(32) NOT NULL,
        path TEXT COLLATE utf8mb4_bin NOT NULL,
        collection_hash BINARY(32) NOT NULL,
        collection_path TEXT COLLATE utf8mb4_bin NOT NULL,
        document_id VARCHAR(1500) COLLATE utf8mb4_bin NOT NULL,
        data JSON NOT NULL,
        version BIGINT UNSIGNED NOT NULL DEFAULT 1,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (path_hash),
        KEY idx_ink_documents_collection (collection_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `)
    .then(() => undefined);
  await schemaReady;
  return pool;
}
