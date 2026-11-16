import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverEntry = new URL("../src/server.js", import.meta.url);

const routeFiles = [
  {
    path: new URL("../src/routes/admin.routes.js", import.meta.url),
    mount: 'app.use("/api/admin", adminRoutes);',
    adminMount: true,
    unguardedAllowlist: new Set(),
  },
  {
    path: new URL("../src/routes/adminPro.routes.js", import.meta.url),
    mount: 'app.use("/api/admin", adminProRoutes);',
    adminMount: true,
    // This endpoint only returns the authenticated administrator's own
    // effective access profile; all other endpoints require a named permission.
    unguardedAllowlist: new Set(["GET /access"]),
  },
  {
    path: new URL("../src/routes/curriculum.routes.js", import.meta.url),
    mount: 'app.use("/api/courses", curriculumRoutes);',
    adminMount: false,
    unguardedAllowlist: new Set(),
  },
  {
    path: new URL("../src/routes/adminPricing.routes.js", import.meta.url),
    mount: 'app.use("/api/admin/pricing", adminPricingRoutes);',
    adminMount: true,
    unguardedAllowlist: new Set(),
  },
  {
    path: new URL("../src/routes/adminTrials.routes.js", import.meta.url),
    mount: 'app.use("/api/admin/trials", adminTrialsRoutes);',
    adminMount: true,
    unguardedAllowlist: new Set(),
  },
  {
    path: new URL("../src/routes/savedView.routes.js", import.meta.url),
    mount: 'app.use("/api/admin/saved-views", savedViewRoutes);',
    adminMount: true,
    unguardedAllowlist: new Set(),
  },
];

const routePattern = /^\s*router\.(get|post|put|patch|delete)\s*\(\s*(["'])([^"']+)\2\s*,([^\r\n]*)$/gim;
const adminMountPattern = /^\s*app\.use\(\s*(["'])\/api\/admin(?:\/[^"']*)?\1\s*,\s*(\w+)\s*\);/gm;

test("admin route inventory includes every mounted admin-capable router", async () => {
  const serverSource = await readFile(serverEntry, "utf8");
  const expectedAdminRouters = routeFiles
    .filter((routeFile) => routeFile.adminMount)
    .map((routeFile) => routeFile.mount.match(/,\s*(\w+)\s*\);$/)[1])
    .sort();
  const mountedAdminRouters = [...serverSource.matchAll(adminMountPattern)]
    .map((match) => match[2])
    .sort();

  assert.deepEqual(
    mountedAdminRouters,
    expectedAdminRouters,
    "every router mounted under /api/admin must be included in the permission audit",
  );

  for (const routeFile of routeFiles) {
    assert.ok(
      serverSource.split("\n").some((line) => line.trim() === routeFile.mount),
      `expected ${routeFile.path.pathname} to be mounted by server.js as ${routeFile.mount}`,
    );
  }
});

test("every admin endpoint is protected by a named permission or explicit self-access exception", async () => {
  let checked = 0;
  const uncovered = [];
  const usedExceptions = new Map();

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile.path, "utf8");
    assert.match(
      source,
      /router\.use\(authMiddleware, adminMiddleware\)/,
      `admin router must require authentication and admin access: ${routeFile.path.pathname}`,
    );

    for (const match of source.matchAll(routePattern)) {
      checked += 1;
      const method = match[1].toUpperCase();
      const routePath = match[3];
      const middlewareAndHandler = match[4];
      const routeKey = `${method} ${routePath}`;

      if (routeFile.unguardedAllowlist.has(routeKey)) {
        usedExceptions.set(routeFile, (usedExceptions.get(routeFile) ?? new Set()).add(routeKey));
        continue;
      }

      if (!/adminPermissionMiddleware\s*\(/.test(middlewareAndHandler)) {
        uncovered.push(`${routeKey} (${routeFile.path.pathname})`);
      }
    }
  }

  // The six mounted admin-capable route modules currently declare 139 routes.
  // Keep this floor high enough to catch an accidentally omitted module.
  assert.ok(
    checked >= 139,
    `expected coverage of the existing admin route surface; found ${checked} route declarations`,
  );

  for (const routeFile of routeFiles) {
    assert.deepEqual(
      [...(usedExceptions.get(routeFile) ?? [])].sort(),
      [...routeFile.unguardedAllowlist].sort(),
      `every self-access exception must match an actual route: ${routeFile.path.pathname}`,
    );
  }

  assert.deepEqual(
    uncovered,
    [],
    "every admin route must enforce a named permission at the server boundary",
  );
});
