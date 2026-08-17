import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  formatGeneratedTranslation,
  loadGeneratedTranslations,
  parseGeneratedTranslation,
  sourceFingerprint,
} from "../scripts/spanish-translation-data.mjs";
import {
  allContentPaths,
  generateSpanishTranslations,
  requestSpanishTranslation,
  validateGeneratedTranslation,
} from "../scripts/translate-spanish.mjs";

const sampleItem = {
  id: "sample-prayer",
  title: "Sample Prayer",
  type: "prayer",
  devotion: "God",
  search: ["sample", "morning"],
  language: "en",
  text: "Eternal Father, I offer Thee this day.\n\nV. Glory be to the Father.\nR. Amen.",
};

const sampleTranslation = {
  title: "Oración de ejemplo",
  search: ["ejemplo", "mañana", "ofrenda"],
  text: "Padre eterno, te ofrezco este día.\n\nV. Gloria al Padre.\nR. Amén.",
};

function mockResponse(translation = sampleTranslation) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        status: "completed",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(translation) }],
        }],
      };
    },
  };
}

test("source fingerprints change whenever source prayer data changes", () => {
  const original = sourceFingerprint(sampleItem);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(sourceFingerprint({ ...sampleItem }), original);
  assert.notEqual(sourceFingerprint({ ...sampleItem, text: `${sampleItem.text}\nAmen.` }), original);
  assert.notEqual(sourceFingerprint({ ...sampleItem, title: "Changed title" }), original);
});

test("generated Spanish files are reviewable Markdown with strict metadata", () => {
  const fingerprint = sourceFingerprint(sampleItem);
  const source = formatGeneratedTranslation({
    id: sampleItem.id,
    sourceHash: fingerprint,
    review: "required",
    model: "test-model",
    ...sampleTranslation,
  });
  const parsed = parseGeneratedTranslation(source, `${sampleItem.id}.md`);

  assert.equal(parsed.id, sampleItem.id);
  assert.equal(parsed.sourceHash, fingerprint);
  assert.equal(parsed.review, "required");
  assert.equal(parsed.model, "test-model");
  assert.equal(parsed.title, sampleTranslation.title);
  assert.deepEqual(parsed.search, sampleTranslation.search);
  assert.equal(parsed.text, sampleTranslation.text);
});

test("the Responses API request uses strict structured output and no storage", async () => {
  let requestBody;
  const translated = await requestSpanishTranslation(sampleItem, {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      requestBody = JSON.parse(options.body);
      return mockResponse();
    },
  });

  assert.equal(requestBody.model, "test-model");
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.schema.additionalProperties, false);
  assert.equal(JSON.parse(requestBody.input).id, sampleItem.id);
  assert.deepEqual(validateGeneratedTranslation(sampleItem, translated), sampleTranslation);
});

test("a missing API key produces an actionable setup error", async () => {
  await assert.rejects(
    requestSpanishTranslation(sampleItem, { apiKey: "" }),
    /OPENAI_API_KEY.*Actions repository secret/,
  );
});

test("the generator writes a file-per-prayer override and then skips unchanged source", async () => {
  const directory = mkdtempSync(join(tmpdir(), "orarium-spanish-"));
  try {
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      return mockResponse({
        title: "Acto de adoración",
        search: ["adoración", "ofrenda", "Dios"],
        text: "Oh gran Dios, soberano Señor del cielo y de la tierra, me postro ante Ti. Con todos los ángeles y santos, te reconozco como mi Creador y soberano Señor, mi primer principio y mi último fin. Te rindo el homenaje de mi vida. Me someto a tu santa Voluntad y me consagro a tu divino servicio en este día y para siempre.",
      });
    };

    const first = await generateSpanishTranslations(["content/act-of-adoration.md"], {
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
      destination: directory,
      curatedSourceHashes: {},
    });
    assert.equal(first[0].status, "generated");
    assert.equal(requests, 1);

    const generated = loadGeneratedTranslations(directory).get("act-of-adoration");
    assert.equal(generated.review, "required");
    assert.equal(generated.model, "test-model");
    assert.match(readFileSync(join(directory, "act-of-adoration.md"), "utf8"), /review: required/);

    const second = await generateSpanishTranslations(["content/act-of-adoration.md"], {
      apiKey: "",
      model: "test-model",
      fetchImpl,
      destination: directory,
      curatedSourceHashes: {},
    });
    assert.equal(second[0].status, "unchanged");
    assert.equal(requests, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("complete all-content scans do not replace current curated translations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "orarium-curated-skip-"));
  try {
    const results = await generateSpanishTranslations(["content/act-of-adoration.md"], {
      apiKey: "",
      destination: directory,
      fetchImpl: async () => {
        throw new Error("Current curated text must not reach the translation API");
      },
    });
    assert.equal(results[0].status, "unchanged");
    assert.equal(loadGeneratedTranslations(directory).size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated Spanish must retain structural and liturgical markers", () => {
  assert.throws(
    () => validateGeneratedTranslation(sampleItem, { ...sampleTranslation, text: "Padre eterno.\nV. Gloria.\nR. Amén." }),
    /line count/,
  );
  assert.throws(
    () => validateGeneratedTranslation(sampleItem, { ...sampleTranslation, text: sampleTranslation.text.replace("V.", "") }),
    /V\., R\., and Ant\./,
  );
});

test("Latin source texts are skipped without making an API request", async () => {
  const directory = mkdtempSync(join(tmpdir(), "orarium-latin-skip-"));
  try {
    const results = await generateSpanishTranslations(["content/anima-christi.md"], {
      apiKey: "",
      destination: directory,
      fetchImpl: async () => {
        throw new Error("Latin text must not reach the translation API");
      },
    });
    assert.equal(results[0].status, "skipped");
    assert.match(results[0].reason, /Latin/);
    assert.equal(loadGeneratedTranslations(directory).size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all-content scans are stable and include every Markdown prayer", () => {
  const paths = allContentPaths();
  assert.deepEqual(paths, [...paths].sort());
  assert.ok(paths.includes("content/act-of-adoration.md"));
  assert.ok(paths.includes("content/prayer-of-penitence-of-st-afra.md"));
});

test("the GitHub workflow supports main, validates, and commits generated Spanish", () => {
  const workflow = readFileSync(new URL("../.github/workflows/generate-spanish.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /branches-ignore:/);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(workflow, /github\.ref_name == 'main'/);
  assert.match(workflow, /translate-spanish\.mjs --all/);
  assert.match(workflow, /node scripts\/build\.mjs/);
  assert.match(workflow, /node --test/);
  assert.match(workflow, /node scripts\/spanish-audit\.mjs/);
  assert.match(workflow, /git push origin "HEAD:\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /review: required/);
});

test("public builds tolerate pending Spanish while repository checks stay strict", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/generate-spanish.yml", import.meta.url), "utf8");

  assert.match(packageJson.scripts.build, /--allow-pending-spanish/);
  assert.equal(packageJson.scripts.check, "node scripts/build.mjs && node --test");
  assert.match(build, /allowPendingSpanish/);
  assert.match(build, /using the original text until automation finishes/);
  assert.match(workflow, /node scripts\/build\.mjs/);
  assert.doesNotMatch(workflow, /node scripts\/build\.mjs --allow-pending-spanish/);
});
