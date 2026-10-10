#!/usr/bin/env node
/**
 * Merge a folder of Meshy/Mixamo GLB exports (one animation per file, each carrying the
 * same rigged character) into ONE web-ready GLB: one mesh, all clips, textures shrunk.
 *
 *   node tools/fighters3d/build.mjs <inputDir> <out.glb>
 *
 * Clip names come from file names. Name files by move, e.g. idle.glb, walk.glb, jab.glb,
 * cross.glb, body.glb, upper.glb, slip.glb, duck.glb, hithead.glb, hitbody.glb, knockdown.glb.
 * Anything else is kept under its own name. The first file alphabetically (or base.glb /
 * rigged.glb if present) supplies the mesh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, resample } from '@gltf-transform/functions';
import sharp from 'sharp';

const [inDir, outFile] = process.argv.slice(2);
if (!inDir || !outFile) { console.error('usage: build.mjs <inputDir> <out.glb>'); process.exit(1); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = fs.readdirSync(inDir).filter((f) => /\.glb$/i.test(f)).sort();
if (!files.length) throw new Error('no .glb files in ' + inDir);
const baseName = files.find((f) => /^(base|rigged)/i.test(f)) || files[0];

const clipName = (f) => path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_]+/g, '_');

const base = await io.read(path.join(inDir, baseName));
const root = base.getRoot();
const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];

// drop clips that came with the base file; we re-add every file's clip by name
for (const a of root.listAnimations()) a.dispose();

for (const f of files) {
  const src = await io.read(path.join(inDir, f));
  const anims = src.getRoot().listAnimations();
  if (!anims.length) { console.log('skip (no animation):', f); continue; }
  // a file can hold several clips; take the longest
  const a = anims.reduce((m, x) => (dur(x) > dur(m) ? x : m), anims[0]);
  const anim = base.createAnimation(clipName(f));
  let mapped = 0, missed = 0;
  for (const ch of a.listChannels()) {
    const target = ch.getTargetNode();
    const node = target && nodesByName.get(target.getName());
    if (!node) { missed++; continue; }
    const s = ch.getSampler();
    const input = base.createAccessor().setArray(s.getInput().getArray().slice()).setType('SCALAR').setBuffer(buffer);
    const out = s.getOutput();
    const output = base.createAccessor().setArray(out.getArray().slice()).setType(out.getType()).setBuffer(buffer);
    const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    mapped++;
  }
  console.log(`clip ${clipName(f).padEnd(12)} ${dur(a).toFixed(2)}s  channels ${mapped}${missed ? '  (unmatched ' + missed + ')' : ''}`);
}

function dur(anim) {
  let d = 0;
  for (const s of anim.listSamplers()) { const arr = s.getInput().getArray(); d = Math.max(d, arr[arr.length - 1]); }
  return d;
}

await base.transform(
  resample(),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 })
);
await io.write(outFile, base);
console.log('wrote', outFile, (fs.statSync(outFile).size / 1e6).toFixed(2), 'MB');
