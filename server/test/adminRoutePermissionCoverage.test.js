import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeFiles = [
  {
    path: new URL("../src/routes/admin.routes.js", import.meta.url),
    unguardedAllowlist: new Set(),
  },
  {
    path: new URL("../src/routes/adminPro.routes.js", import.meta.url),
    // This endpoint only returns the authenticated administrator's own
    // effective access profile; all other endpoints require a named permission.
    unguardedAllowlist: new Set(["GET /access"]),
  },
  {
    path: new URL("../src/routes/curriculum.routes.js", import.meta.url),
    unguardedAllowlist: new Set(),
  },
];

test("every admin endpoint is protected by a named permission or explicit self-access exception", async () => {
  let checked = 0;
  const uncovered = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile.path, "utf8");
    assert.match(source, /router\.use\(authMiddleware, adminMiddleware\)/, "admin router must require authentication and admin access");

    for (const line of source.split("\n")) {
      const match = line.match(/^\s*router\.(get|post|put|patch|delete)\(["']([^"']+)["'],(.*)$/i);
      if (!match) continue;

      checked += 1;
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const rest = match[3];
      if (routeFile.unguardedAllowlist.has(method + " " + routePath)) continue;
      if (!/adminPermissionMiddleware\(/.test(rest)) {
        uncovered.push(method + " " + routePath + " (" + routeFile.path.pathname + ")");
      }
    }
  }

  assert.ok(checked >= 40, "expected coverage of the existing admin route surface");
  assert.deepEqual(uncovered, [], "every admin route must enforce a permission at the server boundary");
});
