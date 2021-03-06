import { AbstractExpressionNode } from '../../abstract.js';
import { Deserializer } from '../../deserialize/deserialize.js';
import { StackProvider } from '../../scope.js';

/**
 * The empty statement is a semicolon (;) indicating that no statement will be executed,
 * even if JavaScript syntax requires one.
 * The opposite behavior, where you want multiple statements,
 * but JavaScript only allows a single one, is possible using a block statement,
 * which combines several statements into a single one.
 */
@Deserializer('empty')
export class EmptyNode extends AbstractExpressionNode {
	static INSTANCE = Object.freeze(new EmptyNode()) as EmptyNode;
	static fromJSON(node: EmptyNode): EmptyNode {
		return EmptyNode.INSTANCE;
	}
	private semicolon = ';';
	constructor() {
		super();
	}
	set(stack: StackProvider, value: any) {
		throw new Error(`EmptyNode#set() has no implementation.`);
	}
	get(stack: StackProvider) {
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
