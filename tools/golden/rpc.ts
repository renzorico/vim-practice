import { spawn } from 'node:child_process';

/** Minimal MessagePack subset for Neovim RPC requests and replies. */
function encode(value: unknown): Buffer {
  if (typeof value === 'number') {
    const bytes = Buffer.alloc(5);
    bytes[0] = 0xce;
    bytes.writeUInt32BE(value, 1);
    return bytes;
  }
  if (typeof value === 'string') {
    const contents = Buffer.from(value);
    const header = Buffer.alloc(5);
    header[0] = 0xdb;
    header.writeUInt32BE(contents.length, 1);
    return Buffer.concat([header, contents]);
  }
  if (Array.isArray(value)) {
    const header = Buffer.alloc(5);
    header[0] = 0xdd;
    header.writeUInt32BE(value.length, 1);
    return Buffer.concat([header, ...value.map(encode)]);
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    const header = Buffer.alloc(5);
    header[0] = 0xdf;
    header.writeUInt32BE(entries.length, 1);
    return Buffer.concat([header, ...entries.flatMap(([key, entry]) => [encode(key), encode(entry)])]);
  }
  throw new Error('Unsupported RPC argument');
}

const INCOMPLETE = Symbol('incomplete');

function decode(bytes: Buffer, start = 0): { value: unknown; end: number } {
  let offset = start;
  function take(length: number): Buffer {
    if (offset + length > bytes.length) throw INCOMPLETE;
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;
    return chunk;
  }
  function read(): unknown {
    const tag = take(1)[0]!;
    if (tag <= 0x7f) return tag;
    if (tag >= 0xe0) return tag - 256;
    if (tag === 0xc0) return null;
    if (tag === 0xc2 || tag === 0xc3) return tag === 0xc3;
    if (tag === 0xcc) return take(1).readUInt8();
    if (tag === 0xcd) return take(2).readUInt16BE();
    if (tag === 0xce) return take(4).readUInt32BE();
    if (tag === 0xd0) return take(1).readInt8();
    if (tag === 0xd1) return take(2).readInt16BE();
    if (tag === 0xd2) return take(4).readInt32BE();
    let length: number;
    if ((tag & 0xe0) === 0xa0 || tag === 0xd9 || tag === 0xda || tag === 0xdb) {
      length = (tag & 0xe0) === 0xa0 ? tag & 0x1f
        : tag === 0xd9 ? take(1).readUInt8() : tag === 0xda ? take(2).readUInt16BE() : take(4).readUInt32BE();
      return take(length).toString('utf8');
    }
    if ((tag & 0xf0) === 0x90 || tag === 0xdc || tag === 0xdd) {
      length = (tag & 0xf0) === 0x90 ? tag & 0xf : tag === 0xdc ? take(2).readUInt16BE() : take(4).readUInt32BE();
      return Array.from({ length }, () => read());
    }
    if ((tag & 0xf0) === 0x80 || tag === 0xde || tag === 0xdf) {
      length = (tag & 0xf0) === 0x80 ? tag & 0xf
        : tag === 0xde ? take(2).readUInt16BE() : take(4).readUInt32BE();
      return Object.fromEntries(Array.from({ length }, () => [String(read()), read()]));
    }
    throw new Error(`Unsupported MessagePack tag: ${tag}`);
  }
  return { value: read(), end: offset };
}

/** One isolated, headless Neovim. Pipes work without local socket permissions. */
export function startNeovim() {
  const child = spawn('nvim', ['--headless', '--embed', '-u', 'NONE', '-i', 'NONE', '-n'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NVIM_LOG_FILE: '/dev/null' },
  });
  let buffer = Buffer.alloc(0);
  let nextId = 0;
  let failure: Error | undefined;
  let stderr = '';
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  function fail(error: Error): void {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.stdout.on('error', fail);
  child.on('exit', (code) => fail(new Error(`Neovim exited (${code}): ${stderr}`)));
  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (buffer.length) {
        const message = decode(buffer);
        buffer = buffer.subarray(message.end);
        const reply = message.value;
        if (!Array.isArray(reply) || reply[0] !== 1) continue;
        const request = pending.get(reply[1] as number);
        if (!request) continue;
        pending.delete(reply[1] as number);
        if (reply[2] !== null) request.reject(new Error(JSON.stringify(reply[2])));
        else request.resolve(reply[3]);
      }
    } catch (error) {
      if (error !== INCOMPLETE) fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  function request(method: string, arguments_: readonly unknown[] = []): Promise<unknown> {
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(encode([0, id, method, arguments_]), (error) => {
        if (error) fail(error);
      });
    });
  }
  return {
    request,
    lua(code: string, arguments_: readonly string[] = []): Promise<unknown> {
      return request('nvim_exec_lua', [code, arguments_]);
    },
    async close(): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await stopped;
    },
  };
}
