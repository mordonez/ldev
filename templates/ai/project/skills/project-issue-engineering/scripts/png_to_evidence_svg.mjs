#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function usage() {
  console.error('Usage: node png_to_evidence_svg.mjs <input.png> <output.svg>');
}

function readPngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Input is not a PNG file.');
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    throw new Error('PNG IHDR chunk not found.');
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions: ${width}x${height}.`);
  }

  return {width, height};
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    usage();
    process.exitCode = 2;
    return;
  }

  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputPath);
  const png = await fs.readFile(absoluteInput);
  const {width, height} = readPngDimensions(png);
  const base64 = png.toString('base64');
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `  <image href="data:image/png;base64,${base64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`,
    '</svg>',
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(absoluteOutput), {recursive: true});
  await fs.writeFile(absoluteOutput, svg, 'utf8');
  console.log(JSON.stringify({ok: true, input: absoluteInput, output: absoluteOutput, width, height}));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
