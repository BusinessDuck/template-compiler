import { SourceNode } from 'source-map';
import { ChunkList, tagToJS, format, Chunk } from './utils';
import { ElementStats } from './node-stats';
import ElementContext from './element-context';

/**
 * Template compiler scope
 */

export enum RuntimeSymbols {
    get, mountBlock, updateBlock, mountIterator, updateIterator, mountKeyIterator,
    updateKeyIterator, createInjector, block, enterScope, exitScope, getScope,
    getProp, getState, getVar, setVar, setAttribute, updateAttribute, updateProps,
    addClass, finalizeAttributes, finalizeProps, addEvent, addStaticEvent, finalizeEvents,
    getEventHandler, callEventHandler, renderSlot, setRef, setStaticRef, finalizeRefs, createComponent,
    mountComponent, updateComponent, unmountComponent, mountInnerHTML, updateInnerHTML,
    mountPartial, updatePartial, elem, elemWithText, text, updateText, filter, insert
}

interface CompileScopeOptions {
    /** Path to JS module that holds Endorphin runtime functions */
    module?: string;

    /** Symbol for referencing host component of the rendered template */
    host?: string;

    /** Symbol for referencing local scope of rendered component */
    scope?: string;

    /** Symbol for referencing partials container of rendered component */
    partials?: string;

    /** Name of component being compiled, must be in CamelCase */
    component?: string;

    /** Characters for one level of indentation */
    indent?: string;

    /** Prefix for generated top-level module symbols */
    prefix?: string;

    /** Suffix for generated top-level module symbols */
    suffix?: string;
}

interface FunctionContext {
    update: ChunkList;
    parent?: FunctionContext;
    localSymbols: SymbolGenerator;
    updateSymbols: SymbolGenerator;
    updateDeclarations: {
        [name: string]: string
    };

    /** Name of generated function */
    symbol: string;

    /** Output source node for runtime code, required to properly setup element context */
    output: SourceNode;

    /** Injector symbol for function context */
    injector?: string;

    /** A placeholder for scope argument in function */
    scopeArg: SourceNode;

    /** Context of element output */
    element?: ElementContext;
}

interface PartialDeclaration {
    name: string;
    defaults: Chunk
};

export const defaultOptions: CompileScopeOptions = {
    host: 'host',
    scope: 'scope',
    partials: 'partials',
    indent: '\t',
    prefix: '$$',
    suffix: '',
    module: '@endorphinjs/endorphin',
    component: ''
}

export default class CompileScope {
    /** Endorphin runtime symbols required by compiled template */
    runtimeSymbols: Set<RuntimeSymbols> = new Set();

    /** Template symbols, used to store and update data generated by template */
    private readonly scopeSymbols: SymbolGenerator;

    /** Top-level JS module symbols */
    private readonly globalSymbols: SymbolGenerator;

    /** Context of currently rendered template */
    func?: FunctionContext;

    readonly options: CompileScopeOptions;

    /** Contents of compiled template */
    readonly body: SourceNode[] = [];

    readonly partialsMap: Map<string, PartialDeclaration>;

    constructor(options?: CompileScopeOptions) {
        this.options = Object.assign({}, defaultOptions, options);
        const suffix = tagToJS(this.options.component || '', true) + (this.options.suffix || '');

        this.scopeSymbols = new SymbolGenerator(() => `${this.scope}.$_`);
        this.globalSymbols = new SymbolGenerator(this.options.prefix, num => suffix + num);
        this.partialsMap = new Map();
    }

    /** Symbol for referencing host component of the rendered template */
    get host(): string {
        return this.options.host;
    }

    /** Symbol for referencing local scope */
    get scope(): string {
        this.markScopeAsUsed();
        return this.options.scope;
    }

    /** Path to JS module that holds Endorphin runtime functions */
    get module(): string {
        return this.options.module;
    }

    /** Symbol for referencing partials */
    get partials(): string {
        return this.options.partials;
    }

    /** Current indentation token */
    get indent(): string {
        return this.options.indent;
    }

    get element(): ElementContext {
        let func = this.func;
        while (func) {
            if (func.element) {
                return func.element;
            }
            func = func.parent;
        }
    }

    /**
     * Marks given runtime symbol as used by template and returns its string
     * representation
     * @param symbol
     */
    use(symbol: RuntimeSymbols): string {
        this.runtimeSymbols.add(symbol);
        return RuntimeSymbols[symbol];
    }

    /**
     * Creates scope symbol with given name
     */
    scopeSymbol(name: string): string {
        this.markScopeAsUsed();
        return this.scopeSymbols.generate(name);
    }

    /**
     * Creates global JS module symbol
     */
    globalSymbol(name: string): string {
        return this.globalSymbols.generate(name);
    }

    /**
     * Creates symbol, local to currently rendered JS function
     */
    localSymbol(name: string): string {
        return this.func.localSymbols.generate(name);
    }

    /**
     * Push given source node as content of compiled file
     */
    push(node: SourceNode): void {
        this.body.push(node);
    }

    /**
     * Adds given chunk as update item for current function
     */
    pushUpdate(chunk: Chunk): void {
        this.func.update.push(chunk);
    }

    /**
     * Generates symbol for update function. It can be used as a shorthand for
     * referencing `value` in update function
     */
    updateSymbol(name: string, value: string): string {
        if (!(value in this.func.updateDeclarations)) {
            const symbol = this.func.updateDeclarations[value] = this.func.updateSymbols.generate(name);
            this.func.update.unshift(`const ${symbol} = ${value};`);
        }

        return this.func.updateDeclarations[value];
    }

    enterFunction(name: string, injectorSymbol?: string): string {
        const ctx: FunctionContext = {
            symbol: this.globalSymbol(name),
            localSymbols: new SymbolGenerator(),
            updateSymbols: new SymbolGenerator(),
            updateDeclarations: {},
            injector: injectorSymbol,
            parent: this.func,
            output: new SourceNode(),
            scopeArg: new SourceNode(),
            update: []
        };
        this.func = ctx;
        return ctx.symbol;
    }

    exitFunction(body: ChunkList): SourceNode {
        const output = new SourceNode();
        const { func, indent } = this;
        const args = [`${this.host}${func.injector ? `, ${func.injector}` : ''}`, func.scopeArg];

        output.add(`function ${func.symbol}(`);
        output.add(args);
        output.add(`) {\n${indent}`);
        output.add(format(body, indent));

        if (func.update.length) {
            // Generate update function for rendered template
            const updateSymbol = `${func.symbol}Update`;
            output.add(`\n${indent}return ${updateSymbol};\n}\n\n`);
            output.add(`function ${updateSymbol}(`);
            output.add(args);
            output.add(`) {\n${indent}`);
            output.add(format(func.update, indent));
            output.add(`\n}`);
        } else {
            output.add(`\n}`);
        }

        this.func = this.func.parent;
        return output;
    }

    enterElement(name: string, expr: Chunk, stats: ElementStats): SourceNode {
        const ctx = new ElementContext(name, expr, stats, this);
        ctx.parent = this.func.element;
        this.func.element = ctx;
        return ctx.output;
    }

    exitElement(): SourceNode {
        const result = this.element.finalize();
        this.func.element = this.element.parent;
        return result;
    }

    /**
     * Check if content must be inserted via injector at current context
     */
    requiresInjector(): boolean {
        const { element } = this;
        return element ? !element.stats.staticContent : !!this.func.injector;
    }

    /**
     * Returns local injector instance symbol for context element or function
     */
    localInjector(): string {
        if (this.func.element) {
            return this.func.element.localInjector;
        }

        return this.func.injector;
    }

    /**
     * Returns scope injector instance symbol for context element or function
     */
    scopeInjector(): string {
        if (this.func.element) {
            this.markScopeAsUsed();
            return this.func.element.scopeInjector;
        }

        return this.func.injector;
    }

    private markScopeAsUsed() {
        if (this.func && !this.func.scopeArg.children.length) {
            this.func.scopeArg.add(`, ${this.options.scope}`);
        }
    }
}

interface SymbolPartGenerator {
    (num: number): number | string
}

const numGenerator: SymbolPartGenerator = num => num;

class SymbolGenerator {
    _symbols: {
        [prefix: string]: number
    };
    constructor(readonly prefix: string | SymbolPartGenerator = '', readonly suffix: string | SymbolPartGenerator = numGenerator) {
        this._symbols = {};
    }

    /**
     * Generates symbol with given name
     * @param name
     */
    generate(name: string): string {
        if (name in this._symbols) {
            this._symbols[name]++;
        } else {
            this._symbols[name] = 0;
        }

        const num = this._symbols[name];

        return this._getPart(num, this.prefix) + name + this._getPart(num, this.suffix);
    }

    _getPart(num: number, generator: string | SymbolPartGenerator): number | string {
        if (typeof generator === 'function') {
            return generator(num);
        } else if (typeof generator === 'string') {
            return generator;
        }

        return '';
    }
}
