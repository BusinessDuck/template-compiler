import { elemWithText, insert, elem, text, get, mountBlock, updateBlock, unmountBlock, createInjector, addDisposeCallback, mountIterator, updateIterator, unmountIterator } from "@endorphinjs/endorphin";

export default function $$template0(host, scope) {
	const target0 = host.componentView;
	const injector0 = createInjector(target0);
	insert(injector0, elemWithText("h1", "Hello world"));
	scope.$_block1 = mountBlock(host, injector0, $$conditionEntry0);
	addDisposeCallback(host, $$template0Unmount);
	return $$template0Update;
}

function $$template0Update(host, scope) {
	updateBlock(scope.$_block1);
}

function $$template0Unmount(scope) {
	scope.$_block1 = unmountBlock(scope.$_block1);
}

function $$iteratorExpr0(host) {
	return host.props.items;
}

function $$conditionContent1(host, injector) {
	insert(injector, elemWithText("strong", "*"));
}

function $$conditionEntry1(host, scope) {
	if (get(scope.value, "marked")) {
		return $$conditionContent1;
	} 
}

function $$iteratorBlock0(host, injector, scope) {
	const li0 = insert(injector, elem("li"));
	const injector0 = createInjector(li0);
	insert(injector0, text("\n                    item\n                    "));
	scope.$_block0 = mountBlock(host, injector0, $$conditionEntry1);
	addDisposeCallback(injector, $$iteratorBlock0Unmount);
	return $$iteratorBlock0Update;
}

function $$iteratorBlock0Update(host, injector, scope) {
	updateBlock(scope.$_block0);
}

function $$iteratorBlock0Unmount(scope) {
	scope.$_block0 = unmountBlock(scope.$_block0);
}

function $$conditionContent0(host, injector, scope) {
	insert(injector, elemWithText("p", "will iterate"));
	const ul0 = insert(injector, elem("ul"));
	const injector0 = createInjector(ul0);
	scope.$_iter0 = mountIterator(host, injector0, $$iteratorExpr0, $$iteratorBlock0);
	addDisposeCallback(injector, $$conditionContent0Unmount);
	return $$conditionContent0Update;
}

function $$conditionContent0Update(host, injector, scope) {
	updateIterator(scope.$_iter0);
}

function $$conditionContent0Unmount(scope) {
	scope.$_iter0 = unmountIterator(scope.$_iter0);
}

function $$conditionEntry0(host) {
	if (host.props.items) {
		return $$conditionContent0;
	} 
}