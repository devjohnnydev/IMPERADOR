// ============================================================================
// IMPERADOR LOUNGE BAR - INICIALIZADOR (npm start / node server.js)
// O sistema roda no servidor Python (app.py), que tem login, permissões,
// estoque e vendas. Este arquivo só inicia o Python na mesma porta (3000).
// ============================================================================
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const APP = path.join(__dirname, 'app.py');

function findPython() {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test((r.stdout || '') + (r.stderr || ''))) return cmd;
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error('Python 3 não encontrado. Instale em https://www.python.org/downloads/ (marque "Add to PATH").');
  process.exit(1);
}

const child = spawn(python, [APP], {
  cwd: __dirname,
  stdio: 'inherit',
  env: Object.assign({}, process.env, { PORT: String(PORT), NO_BROWSER: '1', PYTHONIOENCODING: 'utf-8' })
});

const stop = () => { if (!child.killed) child.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => process.exit(code || 0));
