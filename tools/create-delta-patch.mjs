#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

const [oldPath, newPath, outputPath] = process.argv.slice(2);
if (!oldPath || !newPath || !outputPath) {
  console.error('Usage: node tools/create-delta-patch.mjs <old-exe> <new-exe> <output.wwdelta>');
  process.exitCode = 2;
} else {
  const oldBytes = await readFile(oldPath);
  const newBytes = await readFile(newPath);
  const blockSize = 64 * 1024;
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const oldBlocks = new Map();
  for (let offset = 0, index = 0; offset < oldBytes.length; offset += blockSize, index += 1) {
    const block = oldBytes.subarray(offset, Math.min(offset + blockSize, oldBytes.length));
    oldBlocks.set(`${block.length}:${hash(block)}`, index);
  }
  const operations = [];
  for (let offset = 0; offset < newBytes.length; offset += blockSize) {
    const block = newBytes.subarray(offset, Math.min(offset + blockSize, newBytes.length));
    const oldIndex = oldBlocks.get(`${block.length}:${hash(block)}`);
    if (oldIndex === undefined) operations.push({ kind: 'data', data: block.toString('base64') });
    else operations.push({ kind: 'copy', block: oldIndex });
  }
  const payload = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    format: 'wwcombo-block-delta',
    blockSize,
    baseSha256: hash(oldBytes),
    targetSha256: hash(newBytes),
    targetBytes: newBytes.length,
    operations
  }), 'utf8');
  await writeFile(outputPath, Buffer.concat([Buffer.from('WWCOMBO_DELTA_V1\n', 'ascii'), deflateRawSync(payload, { level: 9 })]));
  console.log(`Created ${outputPath}`);
  console.log(`Base: ${(oldBytes.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Target: ${(newBytes.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Delta: ${(Buffer.byteLength(payload) / 1024 / 1024).toFixed(2)} MB before compression`);
}
