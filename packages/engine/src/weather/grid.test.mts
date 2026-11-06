import assert from "node:assert/strict";
import test from "node:test";
import { findWeatherGrid } from "./grid.ts";

test("영문 도시 별칭과 상세 행정구역을 가장 가까운 격자로 찾는다", () => {
  assert.equal(findWeatherGrid("seoul")?.location, "서울특별시");
  assert.equal(
    findWeatherGrid("서울특별시 종로구 청운효자동")?.location,
    "서울특별시 종로구 청운효자동",
  );
  assert.equal(findWeatherGrid("존재하지 않는 지역"), undefined);
  assert.equal(findWeatherGrid("중구"), undefined);
});
