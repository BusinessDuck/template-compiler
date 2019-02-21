import { SourceNode } from 'source-map';
import { ChunkList, tagToJS, format, Chunk, qStr, isIdentifier, reverseObject, propAccessor } from './utils';
import { ElementStats } from './node-stats';
import ElementContext from './element-context';
import { ENDImport, ENDElement } from '../ast/template';

/**
 * Template compiler scope
 */

export enum RuntimeSymbols {
    get, mountBlock, updateBlock, mountIterator, updateIterator, mountKeyIterator,
    updateKeyIterator, createInjector, block, setAttribute, addClass, finalizeAttributes,
    addEvent, addStaticEvent, finalizeEvents, mountSlot, setRef, setStaticRef,
    finalizeRefs, createComponent, mountComponent, updateComponent, mountInnerHTML, updateInnerHTML,
    mountPartial, updatePartial, elem, elemWithText, elemNS, elemNSWithText, text, updateText, filter, insert,
    subscribeStore
}

export interface CompileScopeOptions {
    /** Path to JS module that holds Endorphin runtime functions */
    module?: string;

    /** Symbol for referencing host component of the rendered template */
    host?: string;

    /** Symbol for referencing local scope of rendered component */
    scope?: string;

    /** Symbol for referencing partials container of rendered component */
    partials?: string;

    /** String token for scoping CSS styles of component */
    cssScope?: string;

    /**
     * List of supported helpers. Key is an URL of module and value is a list of
     * available (exported) functions in this module
     */
    helpers?: {
        [url: string]: string[];
    };

    /** Name of component being compiled, must be in CamelCase */
    component?: string;

    /** Characters for one level of indentation */
    indent?: string;

    /** Prefix for generated top-level module symbols */
    prefix?: string;

    /** Suffix for generated top-level module symbols */
    suffix?: string;

    /** Do not import components which were detected as unused */
    removeUnusedImports?: boolean;

    /** Called with warning messages */
    warn?(msg: string, pos?: number): void;
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

interface ComponentImport {
    /** JS symbol for referencing imported module */
    symbol: string;

    /** URL of module */
    href: string;

    /** Source node */
    node: ENDImport;

    /** Indicates given component was used */
    used?: boolean;
}

export const defaultOptions: CompileScopeOptions = {
    host: 'host',
    scope: 'scope',
    partials: 'partials',
    indent: '\t',
    prefix: '$$',
    suffix: '',
    module: '@endorphinjs/endorphin',
    component: '',
    helpers: {
        'endorphin/helpers.js': ['emit', 'setState', 'setStore']
    }
}

export default class CompileScope {
    /** Endorphin runtime symbols required by compiled template */
    runtimeSymbols: Set<RuntimeSymbols> = new Set();

    /** Symbol for referencing CSS isolation scope */
    readonly cssScopeSymbol = 'cssScope';

    private readonly usedHelpers: Set<string> = new Set();

    /** Template symbols, used to store and update data generated by template */
    private readonly scopeSymbols: SymbolGenerator;

    /** Top-level JS module symbols */
    private readonly globalSymbols: SymbolGenerator;

    /** Context of currently rendered template */
    func?: FunctionContext;

    readonly options: CompileScopeOptions;

    /** Contents of compiled template */
    readonly body: SourceNode[] = [];

    readonly partialsMap: Map<string, PartialDeclaration> = new Map();

    /** List of child components */
    readonly componentsMap: Map<string, ComponentImport> = new Map();

    /** List of used namespaces */
    readonly namespacesMap: Map<string, string> = new Map();
    private namespaceStack: string[] = [];

    /** List of symbols used for store access */
    readonly usedStore: Set<string> = new Set();

    /**
     * List of available helpers. Key is a helper name (name of function) and value
     * is a module URL
     */
    readonly helpers: {
        [name: string]: string;
    }

    readonly _warned: Set<string> = new Set();

    constructor(options?: CompileScopeOptions) {
        this.options = Object.assign({}, defaultOptions, options);
        const suffix = tagToJS(this.options.component || '', true) + (this.options.suffix || '');

        this.scopeSymbols = new SymbolGenerator(() => `${this.scope}.$_`);
        this.globalSymbols = new SymbolGenerator(this.options.prefix, num => suffix + num);

        // Prepare helpers
        this.helpers = {
            ...reverseObject(defaultOptions.helpers || {}),
            ...reverseObject(this.options.helpers)
        };
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
     * Returns current namespace
     */
    get namespace(): string {
        return this.namespaceStack.length ? this.namespaceStack[this.namespaceStack.length - 1] : null;
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
     * Marks given helper symbol as used
     */
    useHelper(symbol: string): string {
        this.usedHelpers.add(symbol);
        return symbol;
    }

    /**
     * Marks given store symbol as used and returns accessor code
     */
    useStore(symbol: string): string {
        this.usedStore.add(symbol);
        return `${this.host}.store.data${propAccessor(symbol)}`;
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
        const ctx = new ElementContext(name, expr, stats, this, this.isComponent(name));
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
     * Enters XML namespace with given URI. All elements will be created with given
     * namespace
     */
    enterNamespace(uri: string) {
        let symbol: string;
        if (this.namespacesMap.has(uri)) {
            symbol = this.namespacesMap.get(uri);
        } else {
            symbol = this.globalSymbol('ns');
            this.namespacesMap.set(uri, symbol);
        }

        this.namespaceStack.push(symbol);
    }

    /**
     * Exit current namespace
     */
    exitNamespace() {
        this.namespaceStack.pop();
    }

    /**
     * Check if content must be inserted via injector at current context
     */
    requiresInjector(): boolean {
        const { element } = this.func;

        // NB: slot content must be inserted via injector
        return element
            ? this.inComponent() || !element.stats.staticContent || !!element.stats.slotContent
            : !!this.func.injector;
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

    /**
     * Check if given tag name is a component in current scope
     */
    isComponent(tagName: string): boolean {
        return this.componentsMap.has(tagName);
    }

    checkComponent(node: ENDElement): void {
        const tagName = node.name.name;

        const data = this.componentsMap.get(tagName);
        if (data) {
            data.used = true;
        } else if (tagName.includes('-') && !this._warned.has(tagName)) {
            this._warned.add(tagName);
            this.warn(`Missing component definition for <${tagName}>, did you forgot to <link rel="import"> it?`, node.loc.start.pos);
        }
    }

    /**
     * Check if scope is currently in component
     */
    inComponent(): boolean {
        const elem = this.element;
        return !!elem && this.isComponent(elem.name);
    }

    /**
     * Compiles current scope state to final JS code
     */
    compile(): SourceNode {
        // Generate final output
        const body = new SourceNode();

        // Import runtime symbols, used by template
        if (this.runtimeSymbols.size) {
            body.add(`import { ${Array.from(this.runtimeSymbols).map(symbol => RuntimeSymbols[symbol]).join(', ')} } from "${this.options.module}";\n`);
        }

        // Import child components
        if (this.componentsMap.size) {
            const removeUnused = this.options.removeUnusedImports;

            this.componentsMap.forEach((item, name) => {
                if (!item.used) {
                    this.warn(`Unused import "${name}"${removeUnused ? ', skipping' : ''}`, item.node.loc.start.pos);
                    if (removeUnused) {
                        return;
                    }
                }

                body.add(`import * as ${item.symbol} from ${qStr(item.href)};\n`);
            });
        }

        // Import helpers
        this.getHelpersMap().forEach((helpers, url) => {
            body.add(`import { ${helpers.join(', ')} } from ${qStr(url)};\n`);
        });

        // CSS scoping
        if (this.options.cssScope) {
            body.add(`\nexport const cssScope = ${qStr(this.options.cssScope)};\n`);
        }

        // Partials declarations
        if (this.partialsMap.size) {
            body.add(`\nexport const ${this.partials} = {`);
            const innerIndent = this.indent.repeat(2);
            let count = 0;
            this.partialsMap.forEach((partial, name) => {
                if (count++) {
                    body.add(',\n');
                }

                body.add([
                    `\n${this.indent}`, isIdentifier(name) ? name : qStr(name), ': {\n',
                    `${innerIndent}body: ${partial.name},\n`,
                    `${innerIndent}defaults: `, partial.defaults, '\n',
                    `${this.indent}}`
                ]);
            });

            body.add('\n};\n');
        }

        // Used namespaces
        this.namespacesMap.forEach((symbol, uri) => {
            body.add(`const ${symbol} = ${qStr(uri)};\n`);
        });

        this.body.forEach(chunk => body.add(['\n', chunk, '\n']));

        return body;
    }

    markScopeAsUsed() {
        if (this.func && !this.func.scopeArg.children.length) {
            this.func.scopeArg.add(`, ${this.options.scope}`);
        }
    }

    /**
     * Returns map of used helpers and their URLs
     */
    getHelpersMap(): Map<string, string[]> {
        const result: Map<string, string[]> = new Map();

        this.usedHelpers.forEach(helper => {
            const url = this.helpers[helper];
            if (result.has(url)) {
                result.get(url).push(helper);
            } else {
                result.set(url, [helper]);
            }
        });

        return result;
    }

    /** Displays warning with given message  */
    warn(msg: string, pos?: number) {
        if (this.options.warn) {
            this.options.warn(msg, pos);
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
