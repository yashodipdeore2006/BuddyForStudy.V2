import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = new URL("../../src/App.tsx", import.meta.url);
const layoutPath = new URL("../../src/pages/admin/AdminLayout.tsx", import.meta.url);

test("every application admin page is mapped to an explicit shared-layout permission", async () => {
  const [app, layout] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(layoutPath, "utf8")
  ]);

  const appRoutes = [...app.matchAll(/<Route path="(\/admin[^"]*)" element=\{<AdminPage>/g)]
    .map((match) => match[1]);
  assert.ok(appRoutes.length >= 20, "expected inventory of the registered admin application routes");

  const linksStart = layout.indexOf("const links = [");
  const linksEnd = layout.indexOf("\n];", linksStart);
  assert.ok(linksStart >= 0 && linksEnd > linksStart, "shared layout primary navigation must declare its permission map");
  const linksSource = layout.slice(linksStart, linksEnd);
  const mappedPermissions = new Map(
    [...linksSource.matchAll(/to:\s*"(\/admin[^"]+)"[^\n]*permission:\s*"([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
  );

  const overrideMatch = layout.match(/const routePermissionOverrides: Record<string, string> = \{([\s\S]*?)\};/);
  assert.ok(overrideMatch, "routes omitted from primary navigation must be explicitly permission-mapped");
  const overrides = new Map(
    [...overrideMatch[1].matchAll(/"(\/admin[^"]+)":\s*"([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
  );
  for (const [path, permission] of overrides) {
    assert.ok(appRoutes.includes(path), "permission override references an unregistered admin route: " + path);
    assert.ok(permission.trim(), "permission override cannot be empty for " + path);
  }

  const missing = appRoutes.filter((path) => !(mappedPermissions.get(path) || overrides.get(path)));
  assert.deepEqual(missing, [], "every admin route must map to an explicit permission before direct navigation is allowed");
  assert.match(
    layout,
    /links\.find\(\(item\) => item\.to === location\.pathname\)\?\.permission \?\? routePermissionOverrides\[location\.pathname\]/,
    "direct route access must use the same permission map as the navigation"
  );
});
