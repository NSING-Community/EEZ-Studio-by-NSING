// Build-time helper: downloads the resources that the app would otherwise fetch
// from the network at project creation time, so a permanently offline machine
// can still create projects:
//
//   - the curated eez-project examples (resources/project-examples) together
//     with a filtered catalog seed;
//   - the built-in LVGL project templates (resources/project-templates).
//
// Run with: npm run fetch-project-resources
// Only the templates: node tools/fetch-project-resources.js templates
// Only run this while writing a release; the app never executes this file.
//
// resources/project-examples-custom (hand-maintained examples) is deliberately
// NOT managed here: this script wipes the directories it owns, so custom entries
// live elsewhere. Do not add their names to EXAMPLES_PROJECT_NAMES either - they
// bypass the Wizard whitelist through the "custom" flag instead.

const fs = require("fs");
const path = require("path");

const decompress = require("decompress");

const UPSTREAM_BASE =
    "https://raw.githubusercontent.com/eez-open/eez-project-examples/master/";
const CATALOG_ZIP_URL = UPSTREAM_BASE + "build/catalog.zip";
const CATALOG_VERSION_URL = UPSTREAM_BASE + "build/catalog-version.json";

const TEMPLATES_UPSTREAM_BASE =
    "https://raw.githubusercontent.com/eez-open/eez-project-templates/master/";

// Keep in sync with EXAMPLES_PROJECT_NAMES_FILTER
// (packages/project-editor/project/ui/Wizard.tsx).
const EXAMPLES_PROJECT_NAMES = [
    "Arc",
    "Calculator",
    "Change Screen",
    "LVGL Widgets Demo",
    "Meter",
    "QR Code",
    "Scale",
    "Smart Home",
    "Smart Home (LVGL 9.x)",
    "Smart Home Low Res",
    "Spinbox",
    "Styled Tabview",
    "Tabview"
];

// Keep in sync with the LVGL entries of standardProjectTypes
// (packages/project-editor/project/ui/Wizard.tsx).
const LVGL_TEMPLATE_FILES = [
    "templates/v0.23.0/LVGL-8.3.eez-project",
    "templates/v0.23.0/LVGL-9.0.eez-project"
];

const OUTPUT_DIR = path.resolve(__dirname, "../resources/project-examples");
const TEMPLATES_OUTPUT_DIR = path.resolve(
    __dirname,
    "../resources/project-templates"
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, what) {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const response = await fetch(url, { cache: "reload" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${url}`);
            }
            return Buffer.from(await response.arrayBuffer());
        } catch (error) {
            lastError = error;
            console.warn(`${what}: attempt ${attempt} failed (${error.message})`);
            await sleep(1000 * attempt);
        }
    }
    throw new Error(`${what}: ${lastError.message}`);
}

function encodeUrlPath(relativePath) {
    return relativePath.split("/").map(encodeURIComponent).join("/");
}

// Reject anything that could escape the output directory once joined.
function toSafeRelativePath(relativePath) {
    const normalized = relativePath.replace(/\\/g, "/");
    if (
        !normalized ||
        normalized.includes("\0") ||
        path.posix.isAbsolute(normalized) ||
        /^[a-zA-Z]:/.test(normalized)
    ) {
        throw new Error(`Unsafe path in catalog: ${JSON.stringify(relativePath)}`);
    }
    const parts = normalized.split("/");
    if (parts.some(part => part === "" || part === "." || part === "..")) {
        throw new Error(`Unsafe path in catalog: ${JSON.stringify(relativePath)}`);
    }
    return normalized;
}

function resolveInside(root, relativePath) {
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep)) {
        throw new Error(`Path escapes output directory: ${relativePath}`);
    }
    return target;
}

async function writeFileAtomic(filePath, data) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}`;
    await fs.promises.writeFile(tempPath, data);
    await fs.promises.rename(tempPath, filePath);
}

function parseProject(text, what) {
    let project;
    try {
        project = JSON.parse(text);
    } catch (error) {
        throw new Error(`${what}: not valid JSON (${error.message})`);
    }
    if (!project || typeof project !== "object" || !project.settings) {
        throw new Error(`${what}: missing "settings"`);
    }
    return project;
}

async function downloadCatalog() {
    const buffer = await fetchWithRetry(CATALOG_ZIP_URL, "catalog.zip");
    const files = await decompress(buffer);
    if (!files.length) {
        throw new Error("catalog.zip is empty");
    }
    const catalog = JSON.parse(files[0].data.toString("utf8"));
    if (!Array.isArray(catalog)) {
        throw new Error("catalog.zip does not contain a catalog array");
    }
    return catalog;
}

async function fetchProjectExamples() {
    console.log("Downloading catalog from", CATALOG_ZIP_URL);
    const catalog = await downloadCatalog();

    const selected = EXAMPLES_PROJECT_NAMES.map(projectName => {
        const entry = catalog.find(example => example.projectName === projectName);
        if (!entry) {
            throw new Error(
                `Example project "${projectName}" not found in the upstream catalog`
            );
        }
        return entry;
    });

    if (selected.length !== EXAMPLES_PROJECT_NAMES.length) {
        throw new Error(
            `Expected ${EXAMPLES_PROJECT_NAMES.length} examples, got ${selected.length}`
        );
    }

    // Start from a clean slate so removed examples do not linger.
    await fs.promises.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    for (const example of selected) {
        const relativePath = toSafeRelativePath(example.eezProjectPath);
        const url = UPSTREAM_BASE + encodeUrlPath(relativePath);
        const what = `${example.projectName} (${relativePath})`;

        console.log("Downloading", url);
        const buffer = await fetchWithRetry(url, what);
        const text = buffer.toString("utf8");
        parseProject(text, what);

        await writeFileAtomic(resolveInside(OUTPUT_DIR, relativePath), buffer);

        const resourceFiles = example.resourceFiles || [];
        for (const resourceFile of resourceFiles) {
            const resourceRelativePath = toSafeRelativePath(
                path.posix.join(path.posix.dirname(relativePath), resourceFile)
            );
            const resourceUrl =
                UPSTREAM_BASE + encodeUrlPath(resourceRelativePath);
            console.log("Downloading", resourceUrl);
            const resourceBuffer = await fetchWithRetry(
                resourceUrl,
                `${example.projectName}: ${resourceFile}`
            );
            await writeFileAtomic(
                resolveInside(OUTPUT_DIR, resourceRelativePath),
                resourceBuffer
            );
        }
    }

    const versionBuffer = await fetchWithRetry(
        CATALOG_VERSION_URL,
        "catalog-version.json"
    );
    const versionText = versionBuffer.toString("utf8");
    const version = JSON.parse(versionText);
    if (!version || !version.lastModified) {
        throw new Error('catalog-version.json is missing "lastModified"');
    }

    await writeFileAtomic(
        path.join(OUTPUT_DIR, "examples-catalog.json"),
        JSON.stringify(selected, null, 4)
    );
    await writeFileAtomic(
        path.join(OUTPUT_DIR, "examples-catalog-version.json"),
        versionText
    );

    console.log(
        `Done: ${selected.length} example projects and the catalog seed written to ${OUTPUT_DIR}`
    );
}

async function fetchProjectTemplates() {
    await fs.promises.rm(TEMPLATES_OUTPUT_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(TEMPLATES_OUTPUT_DIR, { recursive: true });

    for (const templateFile of LVGL_TEMPLATE_FILES) {
        const relativePath = toSafeRelativePath(templateFile);
        const url = TEMPLATES_UPSTREAM_BASE + encodeUrlPath(relativePath);

        console.log("Downloading", url);
        const buffer = await fetchWithRetry(
            url,
            `${relativePath} (${url})`
        );
        parseProject(buffer.toString("utf8"), relativePath);

        // Same relative layout as upstream, so a template URL can be mapped to
        // its bundled copy just by stripping the base URL.
        await writeFileAtomic(
            resolveInside(TEMPLATES_OUTPUT_DIR, relativePath),
            buffer
        );
    }

    console.log(
        `Done: ${LVGL_TEMPLATE_FILES.length} project templates written to ${TEMPLATES_OUTPUT_DIR}`
    );
}

const onlyTemplates = process.argv.slice(2).includes("templates");

(async () => {
    if (!onlyTemplates) {
        await fetchProjectExamples();
    }
    await fetchProjectTemplates();
})().catch(error => {
    console.error("Failed to fetch project resources:", error.message);
    process.exit(1);
});
