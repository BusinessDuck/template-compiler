import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { compile } from '../index';

describe('Template generator', () => {
    function read(fileName: string): string {
        return fs.readFileSync(path.resolve(__dirname, fileName), 'utf8').trim();
    }

    it('should generate JS templates', () => {
        const samples = path.resolve(__dirname, 'samples/templates');
        const fixtures = path.resolve(__dirname, 'fixtures/templates');
        const files = fs.readdirSync(samples);

        files.forEach(file => {
            const template = read(path.join(samples, file));
            const fixture = read(path.join(fixtures, file.replace(/\.\w+$/, '.js')));
            const output = compile(template, file);
            assert.equal(output.code.trim(), fixture, file);
        });
    });
});
