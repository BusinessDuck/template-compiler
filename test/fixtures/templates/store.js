import { elem, text, updateText, subscribeStore } from "@endorphinjs/endorphin";

export default function $$template0(host, scope) {
	const target0 = host.componentView;
	const div0 = target0.appendChild(elem("div"));
	const p0 = div0.appendChild(elem("p"));
	p0.appendChild(text("Store value is "));
	scope.$_text0 = p0.appendChild(text(host.store.data.foo));
	subscribeStore(host, ["foo"]);
	return $$template0Update;
}

function $$template0Update(host, scope) {
	updateText(scope.$_text0, host.store.data.foo);
}