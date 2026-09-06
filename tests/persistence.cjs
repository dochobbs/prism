'use strict';
const assert = require('node:assert/strict');

exports.stage = async ({ app, session, write }) => {
  const profile = process.env.COUNCIL_TEST_PROFILE;
  if (!profile || !profile.includes('council-persistence-')) throw new Error('Persistence test requires its own synthetic profile.');
  const ses = session.fromPartition('persist:council-fixture');
  if (write) {
    await ses.cookies.set({ url: 'https://example.org', name: 'synthetic-restart', value: 'retained', expirationDate: Date.now() / 1000 + 600 });
    await ses.cookies.flushStore();
  } else {
    const cookies = await ses.cookies.get({ url: 'https://example.org', name: 'synthetic-restart' });
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].value, 'retained');
    console.log('PASS: synthetic persistent browser session survives process restart.');
  }
};

if (require.main === module) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const os = require('node:os');
  const { spawn } = require('node:child_process');
  (async () => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'council-persistence-'));
    for (const stage of ['write', 'read']) {
      await new Promise((resolve, reject) => {
        const child = spawn(require('electron'), ['.', `--persistence-${stage}`], { cwd: path.join(__dirname, '..'), env: { ...process.env, COUNCIL_TEST_PROFILE: profile }, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Persistence ${stage} failed: ${code}`)));
      });
    }
    console.log(`Synthetic test profile retained at ${profile}`);
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
