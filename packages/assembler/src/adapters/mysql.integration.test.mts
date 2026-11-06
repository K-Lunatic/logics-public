import assert from "node:assert/strict";
import test from "node:test";

test("MySQL 문서 저장소의 전체 계약", {
  skip: !process.env.MYSQL_URL && !process.env.MYSQL_HOST,
}, async (t) => {
  t.after(async () => {
    await (await import("./mysql.ts")).getMySqlPool().then((pool) => pool.end());
  });
  const { dbRemote } = await import("./dataStore.ts");
  const root = `integration/${crypto.randomUUID()}`;
  const first = `${root}/items/first`;
  const second = `${root}/items/second`;

  await dbRemote.batchSet([
    { path: first, data: { id: "first", amount: 1, date: "2026-07-01" } },
    { path: second, data: { id: "second", amount: 2, date: "2026-07-02" } },
  ]);
  assert.equal((await dbRemote.list(`${root}/items`)).length, 2);

  const versioned = await dbRemote.getVersioned<Record<string, unknown>>(first);
  assert.ok(versioned);
  assert.equal(
    await dbRemote.patchIfUnchanged(first, { amount: 3 }, versioned.updateTime),
    true,
  );
  assert.equal(
    await dbRemote.patchIfUnchanged(first, { amount: 4 }, versioned.updateTime),
    false,
  );
  await dbRemote.increment(first, "amount", 2);
  assert.equal(
    (await dbRemote.get<{ amount: number }>(first))?.amount,
    5,
  );
  assert.equal(
    (await dbRemote.range<{ id: string }>(
      root,
      "items",
      "date",
      "2026-07-02",
      "2026-07-31",
    ))[0]?.id,
    "second",
  );

  await dbRemote.batchDelete([first, second]);
  assert.deepEqual(await dbRemote.list(`${root}/items`), []);
});
