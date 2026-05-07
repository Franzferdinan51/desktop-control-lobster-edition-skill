import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runFile(command, args = [], options = {}) {
  const result = await execFileAsync(command, args.map(String), {
    timeout: options.timeout ?? 30000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    encoding: options.encoding ?? 'utf8',
    cwd: options.cwd,
    env: options.env,
  });
  return result;
}

export function runFileWithInput(command, args = [], input = '', options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out`));
    }, options.timeout ?? 30000);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(err.toString('utf8') || `${command} exited ${code}`));
    });
    child.stdin.end(input);
  });
}
