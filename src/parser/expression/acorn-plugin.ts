import { Parser, isIdentifierStart, isIdentifierChar, tokTypes } from 'acorn';

/**
 * Acorn plugin for parsing Endorphin expressions
 */
export default function endorphinJS(P: typeof Parser): typeof Parser {
    return class EndorphinParser extends P {
        readToken(code: number) {
            if (isIdentifierStart(code) || code === 35 /* # */ || code === 64 /* @ */) {
                return this.end_readWord();
            }
            // @ts-ignore
            super.readToken(code);
        }

        /**
         * Reads Endorphin identifier. Unlike JS identifier, this one may start from
         * `#` or `@` and contain dash in name. Also assumes that first character was
         * already checked by `isIdentifierStart` in readToken.
         */
        end_readWord() {
            // @ts-ignore
            let ch: number, start = this.pos;
            do {
                // @ts-ignore
                ch = this.input.charCodeAt(++this.pos);
            } while (isIdentifierChar(ch) || ch === 45); // '-'
            // @ts-ignore
            return this.finishToken(tokTypes.name, this.input.slice(start, this.pos));
        }
    }
}
