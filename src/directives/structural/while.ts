import { Directive } from '@ibyar/core';
import { ExpressionNode, StatementNode, WhileNode } from '@ibyar/expressions';
import { AbstractStructuralDirective } from './structural.js';

@Directive({
	selector: '*while',
})
export class WhileDirective<T> extends AbstractStructuralDirective<T> {

	getStatement() {
		const statement = this.directive.directiveValue.toString().trim();
		if (statement.startsWith('let')) {
			return statement;
		} else {
			return `while (${statement}) { }`;
		}
	}
	getCallback(whileNode: ExpressionNode): () => void {
		let initializer: ExpressionNode;
		let condition: ExpressionNode;
		if (whileNode instanceof StatementNode) {
			if (whileNode.getLines().length > 2) {
				throw new Error(`syntax error: ${this.directive.directiveValue}`);
			}
			initializer = whileNode.getLines()[0];
			condition = whileNode.getLines()[1];
		} else if (whileNode instanceof WhileNode) {
			condition = whileNode.getCondition();
		} else {
			throw new Error(`syntax error: ${this.directive.directiveValue}`);
		}
		const callback = () => {
			if (initializer) {
				initializer.get(this.directiveStack);
			}
			while (condition.get(this.directiveStack)) {
				this.updateView(this.directiveStack);
			}
		};
		return callback;
	}
}
