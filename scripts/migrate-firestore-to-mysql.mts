import { isDeepStrictEqual } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { dbRemote } from "../packages/assembler/src/adapters/dataStore.ts";
import { firestoreHeaders } from "../packages/assembler/src/adapters/firestoreAuth.ts";
import { getMySqlPool } from "../packages/assembler/src/adapters/mysql.ts";

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const stateFile =
  process.env.MIGRATION_STATE_FILE ||
  ".migration/firestore-to-mysql.json";

if (!projectId) {
  throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID가 필요합니다.");
}
if (!process.env.MYSQL_URL && !process.env.MYSQL_HOST) {
  throw new Error("MYSQL_URL 또는 MYSQL_HOST 설정이 필요합니다.");
}

const base =
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
  `/databases/${encodeURIComponent(databaseId)}/documents`;
const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("integerValue" in value) {
    const raw = String(value.integerValue);
    const number = Number(raw);
    return Number.isSafeInteger(number)
      ? number
      : { __firestoreType: "integer", value: raw };
  }
  if ("bytesValue" in value) {
    return { __firestoreType: "bytes", value: value.bytesValue };
  }
  if ("referenceValue" in value) {
    return { __firestoreType: "reference", value: value.referenceValue };
  }
  if ("geoPointValue" in value) {
    return {
      __firestoreType: "geoPoint",
      value: value.geoPointValue,
    };
  }
  if ("arrayValue" in value) {
    const array = value.arrayValue as {
      values?: FirestoreValue[];
    } | undefined;
    return (array?.values || []).map(decodeValue);
  }
  if ("mapValue" in value) {
    const map = value.mapValue as {
      fields?: Record<string, FirestoreValue>;
    } | undefined;
    return decodeFields(map?.fields || {});
  }
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: await firestoreHeaders({
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Firestore 이관 실패 (${response.status} ${response.statusText}): ${detail}`,
    );
  }
  return response.json() as Promise<T>;
}

async function listCollectionIds(parentPath = ""): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const result = await request<{
      collectionIds?: string[];
      nextPageToken?: string;
    }>(
      `${base}${parentPath ? `/${encodePath(parentPath)}` : ""}:listCollectionIds`,
      {
        method: "POST",
        body: JSON.stringify({
          pageSize: 1000,
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );
    ids.push(...(result.collectionIds || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return ids;
}

async function listDocuments(collectionPath: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      pageSize: "300",
      showMissing: "true",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const result = await request<{
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    }>(`${base}/${encodePath(collectionPath)}?${query}`);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function verify(path: string, expected: Record<string, unknown>) {
  const pool = await getMySqlPool();
  const [result] = await pool.execute(
    `SELECT data
     FROM ink_documents
     WHERE path_hash = UNHEX(SHA2(?, 256)) AND path = ?
     LIMIT 1`,
    [path, path],
  );
  const rows = result as Array<{ data: unknown }>;
  const actual =
    typeof rows[0]?.data === "string"
      ? JSON.parse(rows[0].data)
      : rows[0]?.data;
  if (!rows[0] || !isDeepStrictEqual(actual, expected)) {
    throw new Error(`MySQL 검증 실패: ${path}`);
  }
}

type MigrationState = {
  pending: string[];
  completed: string[];
};

async function loadState(): Promise<MigrationState> {
  try {
    const saved = JSON.parse(await readFile(stateFile, "utf8")) as MigrationState;
    if (Array.isArray(saved.pending) && Array.isArray(saved.completed)) return saved;
  } catch {
    // 최초 실행
  }
  return {
    pending: await listCollectionIds(),
    completed: [],
  };
}

async function saveState(state: MigrationState) {
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

let discovered = 0;
let imported = 0;
let missingParents = 0;
const state = await loadState();
const completed = new Set(state.completed);

console.log("Firestore → MySQL 전체 이관 및 문서별 검증을 시작합니다.");
while (state.pending.length > 0) {
  const collectionPath = state.pending[0];
  if (completed.has(collectionPath)) {
    state.pending.shift();
    continue;
  }
  const documents = await listDocuments(collectionPath);
  for (const document of documents) {
    if (!document.name) continue;
    const path = document.name.split("/documents/")[1];
    if (!path) continue;
    discovered += 1;
    if (document.fields) {
      const data = decodeFields(document.fields);
      await dbRemote.set(path, data);
      await verify(path, data);
      imported += 1;
      if (imported % 100 === 0) {
        console.log(`${imported}개 문서 이관·검증 완료`);
      }
    } else {
      missingParents += 1;
    }
    for (const childId of await listCollectionIds(path)) {
      const childPath = `${path}/${childId}`;
      if (!completed.has(childPath) && !state.pending.includes(childPath)) {
        state.pending.push(childPath);
      }
    }
  }
  completed.add(collectionPath);
  state.completed.push(collectionPath);
  state.pending.shift();
  await saveState(state);
}
const pool = await getMySqlPool();
const [countResult] = await pool.query(
  "SELECT COUNT(*) AS count FROM ink_documents",
);
const countRows = countResult as Array<{ count: number }>;
console.log(
  JSON.stringify(
    {
      discovered,
      imported,
      missingParents,
      mysqlDocuments: Number(countRows[0]?.count || 0),
      completedCollections: state.completed.length,
      stateFile,
      result: "success",
    },
    null,
    2,
  ),
);
