import { elem, elemWithText, insert, addStaticEvent, mountIterator, updateIterator, unmountIterator, createInjector, addDisposeCallback } from "@endorphinjs/endorphin";

export default function $$template0(host, scope) {
	const target0 = host.componentView;
	const ul0 = target0.appendChild(elem("ul"));
	const injector0 = createInjector(ul0);
	scope.foo = 1;
	scope.$_iter0 = mountIterator(host, injector0, $$iteratorExpr0, $$iteratorBlock0);
	scope.foo = 2;
	addDisposeCallback(host, $$template0Unmount);
	return $$template0Update;
}

function $$template0Update(host, scope) {
	scope.foo = 1;
	updateIterator(scope.$_iter0);
	scope.foo = 2;
}

function $$template0Unmount(scope) {
	scope.$_iter0 = unmountIterator(scope.$_iter0);
}

function $$iteratorExpr0(host) {
	return host.props.items;
}

function $$iteratorBlock0(host, injector, scope) {
	scope.bar = scope.foo;
	const li0 = insert(injector, elemWithText("li", "item"));
	function handler0(event) {
		if (!host.componentModel) { return; }
		host.componentModel.definition.handleClick(scope.index, scope.foo, scope.bar, host, event, this);
	}
	addStaticEvent(li0, "click", handler0);
	return $$iteratorBlock0Update;
}

function $$iteratorBlock0Update(host, injector, scope) {
	scope.bar = scope.foo;
}