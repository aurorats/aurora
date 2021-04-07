import { AbstractExpressionNode } from '../../abstract.js';
import { Deserializer } from '../../deserialize/deserialize.js';
import { ScopedStack } from '../../scope.js';

/**
 * The empty statement is a semicolon (;) indicating that no statement will be executed,
 * even if JavaScript syntax requires one.
 * The opposite behavior, where you want multiple statements,
 * but JavaScript only allows a single one, is possible using a block statement,
 * which combines several statements into a single one.
 */
@Deserializer('empty')
export class EmptyNode extends AbstractExpressionNode {
	static KEYWORDS = [';'];
	static INSTANCE = Object.freeze(new EmptyNode()) as EmptyNode;
	static fromJSON(node: EmptyNode): EmptyNode {
		return EmptyNode.INSTANCE;
	}
	private semicolon = EmptyNode.KEYWORDS[0];
	constructor() {
		super();
	}
	set(stack: ScopedStack, value: any) {
		throw new Error(`EmptyNode#set() has no implementation.`);
	}
	get(stack: ScopedStack) {
		return void 0;
	}
	entry(): string[] {
		return [];
	}
	event(parent?: string): string[] {
		return [];
	}
	toString(): string {
		return this.semicolon;
	}
	toJson(): object {
		return {};
	}
}
