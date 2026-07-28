import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.resolve(
  root,
  '../../data/NASDAQ/setups/large_candle_four_strategy/published/v1',
);

const manifest = JSON.parse(await readFile(path.join(dataRoot, 'manifest.json'), 'utf8'));
const event = manifest.events[0];
const session = JSON.parse(
  gunzipSync(
    await readFile(path.join(dataRoot, 'sessions', `${event.sessionId}.json.gz`)),
  ).toString('utf8'),
);

const buildDirectory = await mkdtemp(path.join(os.tmpdir(), 'nq-tick-replay-'));

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      outDir: buildDirectory,
      emptyOutDir: false,
      lib: {
        entry: path.join(root, 'src/utils/tickReplay.ts'),
        formats: ['es'],
        fileName: () => 'tickReplay.js',
      },
    },
  });
  const { TickReplayEngine } = await import(
    pathToFileURL(path.join(buildDirectory, 'tickReplay.js')).href
  );
  const atOneX = new TickReplayEngine(session, event);
  const atTenX = new TickReplayEngine(session, event);

  let oneXTickCount = 0;
  let tenXTickCount = 0;
  atOneX.advanceBy(600_000, 1, () => { oneXTickCount += 1; });
  atTenX.advanceBy(60_000, 10, () => { tenXTickCount += 1; });

  assert.equal(atOneX.complete, true);
  assert.equal(atTenX.complete, true);
  assert.equal(oneXTickCount, tenXTickCount);
  assert.deepEqual(atOneX.frame(), atTenX.frame(), 'Playback speed changed the market result');

  const frame = atOneX.frame();
  assert.ok(frame.candles.length > 0);
  assert.ok(frame.rangeBars.length > 1);
  assert.equal(frame.rangeBars.length, frame.rangeCvdBars.length);

  for (const bar of frame.rangeBars.slice(0, -1)) {
    assert.ok(
      Math.abs(bar.high - bar.low - 5.5) < 1e-9,
      `Completed 22R bar has range ${bar.high - bar.low}`,
    );
  }

  const replayTicks = session.ticks.filter(
    (tick) => tick[0] >= event.signalOffsetNs && tick[0] < event.endOffsetNs,
  );
  assert.equal(oneXTickCount, replayTicks.length);

  console.log(
    `Tick replay validated: ${oneXTickCount.toLocaleString()} replay ticks, `
    + `${frame.candles.length} 1m bars, ${frame.rangeBars.length} exact 22R bars; `
    + '1× and 10× results are identical.',
  );
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}
