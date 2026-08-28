import { crc32, deflateRawSync } from "node:zlib";

export function zipFixture(
  entries: readonly Readonly<{
    name: string;
    body: Buffer;
    method?: number;
    flags?: number;
    mode?: number;
    size?: number;
    crc?: number;
  }>[],
): Buffer {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const method = entry.method ?? 0;
    const body = method === 8 ? deflateRawSync(entry.body) : entry.body;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.crc ?? crc32(entry.body), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.size ?? entry.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    files.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(((entry.mode ?? 0x81a4) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const end = Buffer.alloc(22);
  const metadata = Buffer.concat(directory);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(metadata.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, metadata, end]);
}
