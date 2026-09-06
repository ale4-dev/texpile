// a lualatex still warming after the timeout stayed alive for the app's lifetime, blocked on
// stdin and unreachable by stop, the idle timer or window close; each later request spawned another
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawned = vi.hoisted(() => [] as Array<{ kill: ReturnType<typeof vi.fn> }>);
vi.mock('node:child_process', () => ({
	spawn: () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			stdin: { write: vi.fn() },
			kill: vi.fn(),
			pid: 4242
		});
		spawned.push(child);
		return child;
	},
	execFile: vi.fn()
}));
vi.mock('../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: async () => {} }));

import { typesetParagraph } from '../../../../../electron/src/draft/draftDaemon';

afterEach(() => vi.useRealTimers());

describe('draft daemon warm timeout', () => {
	it('kills an engine that never reports ready and fails the request', async () => {
		vi.useFakeTimers();
		const root = mkdtempSync(join(tmpdir(), 'texd-warm-'));
		writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
		try {
			const request = typesetParagraph({ root, mainFile: 'main.tex', engineDir: root, text: 'x' });
			await vi.advanceTimersByTimeAsync(30_000);
			expect(await request).toEqual({ ok: false, error: 'daemon warm timeout' });
			expect(spawned).toHaveLength(1);
			expect(spawned[0].kill).toHaveBeenCalledWith('SIGKILL');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
