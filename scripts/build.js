const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, 'dist');

const JS_FILES = ['background.js', 'utils.js', 'popup.js', 'content.js'];
const ASSETS = ['manifest.json', 'popup.html', 'icons/'];

async function main() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST);
  fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });

  for (const file of JS_FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const result = await minify(code, { ecma: 2020, compress: true, mangle: true });
    const dest = path.join(DIST, file);
    fs.writeFileSync(dest, result.code, 'utf8');
    const kb = (fs.statSync(dest).size / 1024).toFixed(1);
    const saved = ((code.length - result.code.length) / code.length * 100).toFixed(0);
    console.log(`  ${file}  ${kb}KB  (saved ${saved}%)`);
  }

  for (const name of ASSETS) {
    const srcPath = path.join(ROOT, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, path.join(DIST, name));
    } else {
      let content = fs.readFileSync(srcPath, 'utf8');
      if (name === 'popup.html') {
        content = content
          .replace(/\s{2,}/g, ' ')
          .replace(/>\s+</g, '><')
          .replace(/\s+\/?>/g, '>')
          .replace(/"\s+/g, '" ')
          .trim();
      }
      fs.writeFileSync(path.join(DIST, name), content, 'utf8');
      const kb = (fs.statSync(path.join(DIST, name)).size / 1024).toFixed(1);
      console.log(`  ${name}  ${kb}KB`);
    }
  }

  console.log(`\nDone. Output in dist/ (${(dirSize(DIST) / 1024).toFixed(1)}KB total)`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function dirSize(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = path.join(dir, e.name);
    return sum + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
  }, 0);
}

main().catch(e => { console.error(e); process.exit(1); });
