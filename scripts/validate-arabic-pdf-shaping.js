const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const python = process.env.FITNET_PYTHON
  || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const validation = [
  "import sys",
  `sys.path.insert(0, ${JSON.stringify(path.join(root, "scripts"))})`,
  "from render_workout_template_pdf import rtl_text",
  "source = 'خطة تمرين وتغذية مصممة خصيصاً لك'",
  "shaped = rtl_text(source)",
  "assert shaped != source, 'Arabic text was not reshaped for PDF rendering'",
  "assert any('\\ufe70' <= char <= '\\ufeff' for char in shaped), 'Contextual Arabic glyph forms are missing'",
  "assert 'ﺔﻄﺧ' in shaped, 'Bidirectional Arabic display order is incorrect'",
  "print('Arabic PDF shaping checks passed.')",
].join("\n");

const result = spawnSync(python, ["-c", validation], {
  cwd: root,
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Arabic PDF shaping validation failed.\n");
  process.exit(result.status || 1);
}

process.stdout.write(result.stdout);
