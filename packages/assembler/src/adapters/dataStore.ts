import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { createHash } from "node:crypto";
import {
  assertDocumentField,
  assertDocumentPath,
} from "./documentPath";
import { getMySqlPool } from "./mysql";

type DocumentRow = RowDataPacket & {
  data: unknown;
  version: number | string;
};

function pathParts(path: string) {
  const segments = path.split("/");
  return {
    collectionPath: segments.slice(0, -1).join("/"),
    documentId: segments.at(-1)!,
  };
}

const hash = (value: string) => createHash("sha256").update(value).digest();

function json(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function storedPayload(value: unknown): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(json(value))
    : { list: JSON.parse(json(value)) };
}

function readPayload<T>(value: unknown): T {
  const data = parse(value);
  if (!data || typeof data !== "object" || Array.isArray(data)) return data as T;
  const object = data as Record<string, unknown>;
  if (Object.keys(object).length === 1 && "list" in object) {
    return object.list as T;
  }
  if (Object.keys(object).length === 1 && "data" in object) {
    if (typeof object.data !== "string") return object.data as T;
    try {
      return JSON.parse(object.data) as T;
    } catch {
      return object.data as T;
    }
  }
  return object as T;
}

async function upsert(
  connection: PoolConnection,
  path: string,
  data: unknown,
): Promise<void> {
  const { collectionPath, documentId } = pathParts(path);
  await connection.execute(
    `INSERT INTO ink_documents
      (path_hash, path, collection_hash, collection_path, document_id, data)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE
       path = VALUES(path),
       collection_hash = VALUES(collection_hash),
       collection_path = VALUES(collection_path),
       document_id = VALUES(document_id),
       data = VALUES(data),
       version = version + 1`,
    [
      hash(path),
      path,
      hash(collectionPath),
      collectionPath,
      documentId,
      json(data),
    ],
  );
}

async function transaction<T>(
  task: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const pool = await getMySqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await task(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function entries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([, item]) => item !== undefined);
}

function nestedValue(value: unknown, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>(
    (current, key) =>
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}

function setNestedValue(
  value: Record<string, unknown>,
  fieldPath: string,
  next: unknown,
) {
  const path = fieldPath.split(".");
  let current = value;
  path.slice(0, -1).forEach((key) => {
    const child = current[key];
    current[key] =
      child && typeof child === "object" && !Array.isArray(child)
        ? child
        : {};
    current = current[key] as Record<string, unknown>;
  });
  current[path.at(-1)!] = next;
}

export const dbRemote = {
  get: async <T>(
    category: string,
    path?: string,
    _authToken?: string,
  ): Promise<T | null> => {
    const documentPath = assertDocumentPath(
      path ? `${category}/${path}` : category,
      "document",
    );
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<DocumentRow[]>(
      `SELECT data, version
       FROM ink_documents
       WHERE path_hash = ? AND path = ?
       LIMIT 1`,
      [hash(documentPath), documentPath],
    );
    return rows[0] ? readPayload<T>(rows[0].data) : null;
  },

  set: async <T>(
    category: string,
    pathOrData: string | T,
    data?: T,
    _authToken?: string,
  ): Promise<void> => {
    const documentPath = assertDocumentPath(
      data === undefined ? category : `${category}/${pathOrData}`,
      "document",
    );
    const payload = data === undefined ? pathOrData as T : data;
    await transaction((connection) =>
      upsert(connection, documentPath, storedPayload(payload)),
    );
  },

  list: async <T>(
    collectionPath: string,
    _authToken?: string,
  ): Promise<T[]> => {
    assertDocumentPath(collectionPath, "collection");
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<DocumentRow[]>(
      `SELECT data, version
       FROM ink_documents
       WHERE collection_hash = ? AND collection_path = ?
       ORDER BY document_id`,
      [hash(collectionPath), collectionPath],
    );
    return rows.map((row) => parse(row.data) as T);
  },

  range: async <T>(
    parentPath: string,
    collectionId: string,
    fieldPath: string,
    start: string,
    end: string,
    _authToken?: string,
  ): Promise<T[]> => {
    assertDocumentPath(parentPath, "document");
    assertDocumentField(collectionId);
    assertDocumentField(fieldPath);
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<DocumentRow[]>(
      `SELECT data, version
       FROM ink_documents
       WHERE collection_hash = ? AND collection_path = ?
       ORDER BY document_id`,
      [
        hash(`${parentPath}/${collectionId}`),
        `${parentPath}/${collectionId}`,
      ],
    );
    return rows
      .map((row) => parse(row.data) as T)
      .filter((item) => {
        const value = nestedValue(item, fieldPath);
        return typeof value === "string" && value >= start && value <= end;
      })
      .sort((left, right) =>
        String(nestedValue(left, fieldPath)).localeCompare(
          String(nestedValue(right, fieldPath)),
        ),
      );
  },

  patch: async <T extends Record<string, unknown>>(
    documentPath: string,
    updates: T,
    _authToken?: string,
  ): Promise<void> => {
    assertDocumentPath(documentPath, "document");
    const cleanEntries = entries(updates);
    if (cleanEntries.length === 0) return;
    await transaction(async (connection) => {
      const [rows] = await connection.execute<DocumentRow[]>(
        `SELECT data, version
         FROM ink_documents
         WHERE path_hash = ? AND path = ?
         FOR UPDATE`,
        [hash(documentPath), documentPath],
      );
      const current = rows[0] ? parse(rows[0].data) : {};
      const next =
        current && typeof current === "object" && !Array.isArray(current)
          ? { ...current as Record<string, unknown> }
          : {};
      cleanEntries.forEach(([key, value]) => {
        next[key] = value;
      });
      await upsert(connection, documentPath, next);
    });
  },

  delete: async (
    documentPath: string,
    _authToken?: string,
  ): Promise<void> => {
    assertDocumentPath(documentPath, "document");
    const pool = await getMySqlPool();
    await pool.execute(
      "DELETE FROM ink_documents WHERE path_hash = ? AND path = ?",
      [hash(documentPath), documentPath],
    );
  },

  increment: async (
    documentPath: string,
    fieldPath: string,
    amount: number,
    updates: Record<string, unknown> = {},
  ): Promise<void> => {
    assertDocumentPath(documentPath, "document");
    assertDocumentField(fieldPath);
    await transaction(async (connection) => {
      const [rows] = await connection.execute<DocumentRow[]>(
        `SELECT data, version
         FROM ink_documents
         WHERE path_hash = ? AND path = ?
         FOR UPDATE`,
        [hash(documentPath), documentPath],
      );
      if (!rows[0]) throw new Error("증가시킬 문서를 찾지 못했습니다.");
      const current = parse(rows[0].data);
      const next =
        current && typeof current === "object" && !Array.isArray(current)
          ? { ...current as Record<string, unknown> }
          : {};
      entries(updates).forEach(([key, value]) => {
        next[key] = value;
      });
      setNestedValue(
        next,
        fieldPath,
        Number(nestedValue(next, fieldPath) || 0) + amount,
      );
      await upsert(connection, documentPath, next);
    });
  },

  batchSet: async (
    documents: Array<{ path: string; data: Record<string, unknown> }>,
  ): Promise<void> => {
    if (documents.length === 0) return;
    documents.forEach(({ path }) => assertDocumentPath(path, "document"));
    await transaction(async (connection) => {
      for (const document of documents) {
        await upsert(connection, document.path, storedPayload(document.data));
      }
    });
  },

  batchDelete: async (documentPaths: string[]): Promise<void> => {
    if (documentPaths.length === 0) return;
    documentPaths.forEach((path) => assertDocumentPath(path, "document"));
    const pool = await getMySqlPool();
    await transaction(async (connection) => {
      for (const path of documentPaths) {
        await connection.execute(
          "DELETE FROM ink_documents WHERE path_hash = ? AND path = ?",
          [hash(path), path],
        );
      }
    });
  },

  patchIfUnchanged: async <T extends Record<string, unknown>>(
    documentPath: string,
    updates: T,
    updateTime: string,
  ): Promise<boolean> => {
    assertDocumentPath(documentPath, "document");
    return transaction(async (connection) => {
      const [rows] = await connection.execute<DocumentRow[]>(
        `SELECT data, version
         FROM ink_documents
         WHERE path_hash = ? AND path = ?
         FOR UPDATE`,
        [hash(documentPath), documentPath],
      );
      if (!rows[0] || String(rows[0].version) !== updateTime) return false;
      const current = parse(rows[0].data);
      const next =
        current && typeof current === "object" && !Array.isArray(current)
          ? { ...current as Record<string, unknown> }
          : {};
      entries(updates).forEach(([key, value]) => {
        next[key] = value;
      });
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE ink_documents
         SET data = CAST(? AS JSON), version = version + 1
         WHERE path_hash = ? AND path = ? AND version = ?`,
        [json(next), hash(documentPath), documentPath, updateTime],
      );
      return result.affectedRows === 1;
    });
  },

  getVersioned: async <T>(
    documentPath: string,
  ): Promise<{ data: T; updateTime: string } | null> => {
    assertDocumentPath(documentPath, "document");
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<DocumentRow[]>(
      `SELECT data, version
       FROM ink_documents
       WHERE path_hash = ? AND path = ?
       LIMIT 1`,
      [hash(documentPath), documentPath],
    );
    return rows[0]
      ? {
          data: readPayload<T>(rows[0].data),
          updateTime: String(rows[0].version),
        }
      : null;
  },
};
