import type { EvaluateNode, EvaluateType } from './types.js';
import type { NodeDeserializer, ExpressionNode } from '../expression.js';
import { InfixExpressionNode } from '../abstract.js';
import { Deserializer } from '../deserialize/deserialize.js';
import { StackProvider } from '../scope.js';

@Deserializer('assignment')
export class AssignmentNode extends InfixExpressionNode {
	static fromJSON(node: AssignmentNode, deserializer: NodeDeserializer): AssignmentNode {
		return new AssignmentNode(
			node.op,
			deserializer(node.left),
			deserializer(node.right)
		);
	}
	static Evaluations: EvaluateType = {

		'=': (evalNode: EvaluateNode) => { return evalNode.left = evalNode.right; },
		'*=': (evalNode: EvaluateNode) => { return evalNode.left *= evalNode.right; },
		'**=': (evalNode: EvaluateNode) => { return evalNode.left **= evalNode.right; },

		'/=': (evalNode: EvaluateNode) => { return evalNode.left /= evalNode.right; },
		'%=': (evalNode: EvaluateNode) => { return evalNode.left %= evalNode.right; },
		'%%=': (evalNode: EvaluateNode) => { return evalNode.left %= ((evalNode.left % evalNode.right) + evalNode.right) % evalNode.right; },

		'+=': (evalNode: EvaluateNode) => { return evalNode.left += evalNode.right; },
		'-=': (evalNode: EvaluateNode) => { return evalNode.left -= evalNode.right; },

		'<<=': (evalNode: EvaluateNode) => { return evalNode.left <<= evalNode.right; },
		'>>=': (evalNode: EvaluateNode) => { return evalNode.left >>= evalNode.right; },
		'>>>=': (evalNode: EvaluateNode) => { return evalNode.left >>>= evalNode.right; },

		'&=': (evalNode: EvaluateNode) => { return evalNode.left &= evalNode.right; },
		'^=': (evalNode: EvaluateNode) => { return evalNode.left ^= evalNode.right; },
		'|=': (evalNode: EvaluateNode) => { return evalNode.left |= evalNode.right; },

		'>?=': (evalNode: EvaluateNode) => { return evalNode.left = evalNode.left > evalNode.right ? evalNode.left : evalNode.right; },
		'<?=': (evalNode: EvaluateNode) => { return evalNode.left = evalNode.left > evalNode.right ? evalNode.right : evalNode.left; },

	};
	static KEYWORDS = [
		'=', '*=', '**=',
		'/=', '%=', '%%=',
		'+=', '-=',
		'<<=', '>>=', '>>>=',
		'&=', '^=', '|=',
		'>?=', '<?='
	];
	constructor(op: string, left: ExpressionNode, right: ExpressionNode) {
		if (!(AssignmentNode.KEYWORDS.includes(op))) {
			throw new Error(`[${op}]: operation has no implementation yet`);
		}
		super(op, left, right);
	}
	evalNode(evalNode: EvaluateNode) {
		return AssignmentNode.Evaluations[this.op](evalNode);
	}
	set(stack: StackProvider, value: any) {
		return this.left.set(stack, value);
	}
	get(stack: StackProvider): any {
		const value = super.get(stack);
		this.set(stack, value);
		return value;
	}
}
