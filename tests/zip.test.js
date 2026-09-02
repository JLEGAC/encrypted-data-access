import test from "node:test";
import assert from "node:assert/strict";
import { createZip } from "../src/zip.js";

test("le ZIP de publication ne contient que les fichiers publics", async () => {
  const zip = new Uint8Array(await createZip([
    { path: "PUBLIC-GITHUB/encrypted-data-public.json", contents: "{}" },
    { path: "PUBLIC-GITHUB/demo-public.json", contents: "{}" }
  ]).arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(zip);
  assert.match(text, /PUBLIC-GITHUB\/demo-public\.json/u);
  assert.doesNotMatch(text, /SECRET|\.key/u);
  assert.deepEqual([...zip.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});
