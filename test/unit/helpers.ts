import * as fs from 'fs';
import * as path from 'path';

export const repoRoot = path.resolve(__dirname, '..', '..', '..');

export function readExample(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, 'examples', relative), 'utf8');
}
