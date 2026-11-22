import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultFreePlan } from "../src/services/defaultFreePlan.service.js";

function query(value) {
  return {
    sort() { return this; },
    lean: async () => value
  };
}

test("an active explicitly selected zero-priced plan is returned unchanged", async () => {
  const selected = { _id: "free-plan", slug: "free", price: 0, isActive: true, isDefaultFree: true };
  let writes = 0;
  const PlanModel = {
    countDocuments: async () => 1,
    findOne(filter) {
      assert.deepEqual(filter, { isDefaultFree: true, isActive: true, price: 0 });
      return query(selected);
    },
    updateMany: async () => { writes += 1; },
    updateOne: async () => { writes += 1; }
  };

  assert.equal(await getDefaultFreePlan({ PlanModel }), selected);
  assert.equal(writes, 0);
});

test("legacy migration never promotes a positive-priced plan with slug free", async () => {
  const legacyZeroPrice = { _id: "zero-plan", slug: "starter-free", price: 0, isActive: true };
  let selected = null;
  let unsetFilter = null;
  let selectedFilter = null;
  const PlanModel = {
    countDocuments: async filter => {
      assert.deepEqual(filter, { isActive: true, price: 0 });
      return 1;
    },
    findOne(filter) {
      if (filter.isDefaultFree) return query(selected);
      if (filter.slug === "free") return query(null);
      if (filter.price === 0) return query(legacyZeroPrice);
      return query(null);
    },
    updateMany(filter) { unsetFilter = filter; return Promise.resolve({ modifiedCount: 0 }); },
    updateOne(filter, update) {
      selectedFilter = filter;
      selected = { ...legacyZeroPrice, isDefaultFree: update.$set.isDefaultFree };
      return Promise.resolve({ modifiedCount: 1 });
    }
  };

  const result = await getDefaultFreePlan({ PlanModel });
  assert.equal(result._id, "zero-plan");
  assert.equal(result.isDefaultFree, true);
  assert.deepEqual(unsetFilter, { isDefaultFree: true });
  assert.deepEqual(selectedFilter, { _id: "zero-plan", isActive: true, price: 0 });
});

test("multiple legacy zero-priced plans require explicit administrator selection", async () => {
  let writes = 0;
  const PlanModel = {
    findOne: () => query(null),
    countDocuments: async filter => {
      assert.deepEqual(filter, { isActive: true, price: 0 });
      return 3;
    },
    updateMany: async () => { writes += 1; },
    updateOne: async () => { writes += 1; }
  };
  assert.equal(await getDefaultFreePlan({ PlanModel }), null);
  assert.equal(writes, 0);
});

test("no active zero-priced plan means no default Free plan is invented", async () => {
  const PlanModel = {
    findOne: () => query(null),
    countDocuments: async () => 0,
    updateMany: async () => ({ modifiedCount: 0 }),
    updateOne: async () => assert.fail("no plan should be selected")
  };
  assert.equal(await getDefaultFreePlan({ PlanModel }), null);
});
