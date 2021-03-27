import type { ExpressionNode, NodeExpressionClass } from '../api/expression.js';
import { ComputedMemberAccessNode, MemberAccessNode } from '../api/definition/member.js';
import { ArithmeticNode, PostfixNode, PrefixNode } from '../api/operators/arithmetic.js';
import { AssignmentNode } from '../api/operators/assignment.js';
import { OptionalChainingNode } from '../api/operators/chaining.js';
import { EqualityNode } from '../api/operators/equality.js';
import { GroupingNode } from '../api/operators/grouping.js';
import { LogicalAssignmentNode, LogicalNode } from '../api/operators/logical.js';
import { RelationalNode, ThreeWayComparisonNode } from '../api/operators/relational.js';
import { BinaryBitwiseNode, BitwiseShiftNode } from '../api/operators/shift.js';
import { TokenStream } from './stream.js';
import { Token, TokenType } from './token.js';
import { ScopeProvider } from '../api/context/provider.js';
import { TernaryNode } from '../api/operators/ternary.js';
import { PipelineNode } from '../api/operators/pipeline.js';
import { CommaNode } from '../api/operators/comma.js';
import { FunctionCallNode } from '../api/computing/function.js';
import { LiteralUnaryNode, UnaryNode } from '../api/operators/unary.js';
import { NewNode } from '../api/computing/new.js';

/**
 * operator parser
 */
export class OperatorParser {
	constructor(private tokens: Token[]) { }
	getTokenValue(index: number) {
		return this.tokens[index].valueAsExpression();
	}
	/**
	 * Operator precedence
	 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence#table
	 */
	scan(): void {
		this.parseGrouping();
		this.parseMemberAccess();
		this.parseComputedMemberAccess();
		this.parseNewOperator();
		this.parseFunctionCall();
		this.parseOptionalChaining();

		this.parsePostfixIncrementDecrement();
		this.parseUnary();
		this.parsePrefixIncrementDecrement();
		this.parseLiteralUnary();

		// Exponentiation (**)	right-to-left	… ** …
		this.parseInfixNodeType(ArithmeticNode);
		this.parseArithmeticUnary();

		this.parseInfixNodeType(BitwiseShiftNode);
		this.parseInfixNodeType(ThreeWayComparisonNode);
		this.parseInfixNodeType(RelationalNode);
		this.parseInfixNodeType(EqualityNode);

		this.parseInfixNodeType(BinaryBitwiseNode);
		this.parseInfixNodeType(LogicalNode);

		this.parsePipeline();
		this.parseTernary();


		this.parseInfixNodeType(AssignmentNode);
		this.parseInfixNodeType(LogicalAssignmentNode);

		// this.parseYield();
		// this.parseYieldAstr();
		this.parseCommaSequence();
	}
	parseGrouping(): void {
		let open: boolean;
		const stream = TokenStream.getTokenStream(this.tokens);
		while (open = stream.seekTo(TokenType.OPEN_PARENTHESES)) {

			const start = stream.getPos() - 1;
			const group = stream.getStreamer(TokenType.CLOSE_PARENTHESES);
			const end = stream.getPos();

			const tokenParser = new OperatorParser(group.toTokens());
			tokenParser.scan();
			let expression: ExpressionNode;
			if (tokenParser.tokens.length > 0) {
				expression = tokenParser.getTokenValue(0);
			} else {
				expression = undefined as unknown as ExpressionNode;
			}
			const groupExpression = new Token(TokenType.EXPRESSION, new GroupingNode(expression));
			this.tokens.splice(start, end - start, groupExpression);
			stream.setPos(start);
		}
	}
	parseMemberAccess(): void {
		for (let index = 1; index < this.tokens.length - 1; index++) {
			if (this.tokens[index].type === TokenType.OPERATOR && this.tokens[index].value === '.') {
				const member = new Token(
					TokenType.EXPRESSION,
					new MemberAccessNode(
						this.tokens[index - 1].value as ExpressionNode,
						this.tokens[index + 1].value as ExpressionNode
					)
				);
				this.tokens.splice(index - 1, 3, member);
				index--;
			}
		}
	}
	parseComputedMemberAccess(): void {
		let open: boolean;
		const stream = TokenStream.getTokenStream(this.tokens);
		while (open = stream.seekTo(TokenType.OPEN_BRACKETS)) {
			if (open && !stream.lastToken()?.isFunctionCall()) {
				const start = stream.getPos() - 2;
				const propertyName = stream.getStreamer(TokenType.CLOSE_BRACKETS);
				const end = stream.getPos();

				const tokenParser = new OperatorParser(propertyName.toTokens());
				tokenParser.scan();
				const property = tokenParser.getTokenValue(0);
				const propertyExpression = new Token(
					TokenType.EXPRESSION,
					new ComputedMemberAccessNode(this.getTokenValue(start), property)
				);
				this.tokens.splice(start, end - start, propertyExpression);
				stream.setPos(start);
			}
		}
	}
	parseNewOperator() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				if (this.tokens[index].value === 'new') {
					let className: ExpressionNode;
					const start = index;
					let end: number;
					const classNameTokens: Token[] = [];
					for (end = start + 1; end < this.tokens.length; end++) {
						if (this.tokens[end].isEofSmCP() || this.tokens[end].value instanceof GroupingNode) {
							break;
						}
						classNameTokens.push(this.tokens[end]);
					}
					if (classNameTokens.length === 1 && classNameTokens[0].isPropOrExp()) {
						className = classNameTokens[0].valueAsExpression();
					} else {
						const classNameParser = new OperatorParser(classNameTokens);
						classNameParser.scan();
						className = classNameParser.tokens[0].valueAsExpression();
					}
					if (this.tokens[end]?.type === TokenType.EXPRESSION && this.tokens[end].value instanceof GroupingNode) {
						const node = (this.tokens[end].value as GroupingNode).getNode();
						let params: ExpressionNode[] | undefined;
						if (node instanceof CommaNode) {
							params = node.getExpressions();
						} else if (node) {
							params = [node];
						}
						const newNode = new Token(TokenType.EXPRESSION, new NewNode(className, params));
						this.tokens.splice(start, end - start + 1, newNode);
					} else {
						// without arguments
						const newNode = new Token(TokenType.EXPRESSION, new NewNode(className));
						this.tokens.splice(start, end - start + 1, newNode);
					}
				}
			}
		}
	}
	parseFunctionCall() {
		for (let index = this.tokens.length - 1; index >= 0; index--) {
			if (index > 0 && this.tokens[index].value instanceof GroupingNode) {
				if (this.tokens[index - 1].isPropOrExp()) {
					const func = this.getTokenValue(index - 1);
					const node = (this.getTokenValue(index) as GroupingNode).getNode();
					let params: ExpressionNode[];
					if (node instanceof CommaNode) {
						params = node.getExpressions();
					} else if (node) {
						params = [node];
					} else {
						params = [];
					}
					const funcNode = new Token(TokenType.EXPRESSION, new FunctionCallNode(func, params));
					this.tokens.splice(index - 1, 2, funcNode);
					index--;
				}
			}
		}
	}
	parseOptionalChaining() {
		for (let index = 0; index < this.tokens.length; index++) {
			if (this.tokens[index].type === TokenType.OPERATOR && this.tokens[index].value === '?.') {
				let temp: Token;
				switch (this.tokens[index + 1].type) {
					case TokenType.OPEN_BRACKETS:
						// computed property access
						temp = new Token(
							TokenType.EXPRESSION,
							new OptionalChainingNode(
								this.getTokenValue(index - 1),
								this.getTokenValue(index + 2),
								'expression'
							)
						)
						this.tokens.splice(index - 1, 5, temp);
						break;
					case TokenType.EXPRESSION:
						// property access
						temp = new Token(
							TokenType.EXPRESSION,
							new OptionalChainingNode(
								this.getTokenValue(index - 1),
								this.getTokenValue(index + 1),
								'property'
							)
						)
						this.tokens.splice(index - 1, 3, temp);
						break;
					case TokenType.EXPRESSION:
						// function access
						if (this.tokens[index + 1].value instanceof FunctionCallNode) {
							temp = new Token(
								TokenType.EXPRESSION,
								new OptionalChainingNode(
									this.getTokenValue(index - 1),
									this.getTokenValue(index + 1),
									'function'
								)
							)
							this.tokens.splice(index - 1, 3, temp);
						}
						break;
				}
			}
		}
	}
	parsePostfixIncrementDecrement() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				switch (this.tokens[index].value) {
					case '++':
					case '--':
						if (this.tokens[index - 1].isPropOrExp()) {
							// check of is postfix
							if ((this.tokens[index].index! - this.tokens[index - 1].index!) === 2) {
								const postfix = new Token(TokenType.EXPRESSION,
									new PostfixNode(
										this.tokens[index].value as '++' | '--',
										this.getTokenValue(index - 1)
									)
								);
								this.tokens.splice(index - 1, 2, postfix);
							}
						}
						break;
					default:
				}
			}

		}
	}
	parseUnary() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				switch (this.tokens[index].value) {
					case '!':
					case '~':
						const unary = new Token(TokenType.EXPRESSION,
							new UnaryNode(
								this.tokens[index].value as string,
								this.getTokenValue(index + 1)
							)
						);
						this.tokens.splice(index, 2, unary);
						break;
					default:
				}
			}

		}
	}
	parseArithmeticUnary() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				switch (this.tokens[index].value) {
					case '+':
					case '-':
						if (this.tokens[index + 1].isPropOrExp()) {
							// check of is prefix
							if ((this.tokens[index + 1].index! - this.tokens[index].index!) === 1) {
								const literalUnary = new Token(TokenType.EXPRESSION,
									new UnaryNode(
										this.tokens[index].value as string,
										this.getTokenValue(index + 1)
									)
								);
								this.tokens.splice(index, 2, literalUnary);
							}
						}
						break;
					default:
				}
			}

		}
	}
	parsePrefixIncrementDecrement() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				switch (this.tokens[index].value) {
					case '++':
					case '--':
						if (this.tokens[index + 1].isPropOrExp()) {
							// check of is prefix
							if ((this.tokens[index + 1].index! - this.tokens[index].index!) === 2) {
								const prefix = new Token(TokenType.EXPRESSION,
									new PrefixNode(
										this.tokens[index].value as '++' | '--',
										this.getTokenValue(index + 1)
									)
								);
								this.tokens.splice(index, 2, prefix);
							}
						}
						break;
					default:
				}
			}

		}
	}
	parseLiteralUnary() {
		for (let index = this.tokens.length - 2; index >= 0; index--) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				switch (this.tokens[index].value) {
					case 'typeof':
					case 'void':
					case 'delete':
					case 'await':
						const literalUnary = new Token(TokenType.EXPRESSION,
							new LiteralUnaryNode(
								this.tokens[index].value as string,
								this.getTokenValue(index + 1)
							)
						);
						this.tokens.splice(index, 2, literalUnary);
						break;
					default:
				}
			}

		}
	}
	parsePipeline() {
		for (let index = 0; index < this.tokens.length; index++) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				if ('|>' === this.tokens[index].value) {
					const param = this.tokens[index - 1].value as ExpressionNode;
					const func = this.tokens[index + 1].value as ExpressionNode;
					if (this.tokens[index + 2]?.value === ':'
						|| this.tokens[index + 2]?.type === TokenType.OPEN_PARENTHESES) {
						const args: ExpressionNode[] = [];
						let paramterIndex = 0;
						let pointer = index + 3;
						for (; pointer < this.tokens.length; pointer++) {
							if (!this.tokens[pointer] || this.tokens[pointer].isEofSmCP()) {
								break;
							}
							if (this.tokens[pointer].value === '?') {
								paramterIndex = args.length;
								continue;
							} else if (
								this.tokens[pointer].value === ':'
								|| this.tokens[pointer]?.type === TokenType.COMMA) {
								continue;
							}
							args.push(this.getTokenValue(pointer));
						}
						const ternary = new Token(TokenType.EXPRESSION, new PipelineNode(param, func, args, paramterIndex));
						this.tokens.splice(index - 1, pointer - index, ternary);
						index -= 2;
					} else {
						const ternary = new Token(TokenType.EXPRESSION, new PipelineNode(param, func));
						this.tokens.splice(index - 1, 3, ternary);
						index -= 2;
					}
				}
			}
		}
	}
	parseTernary() {
		for (let index = 0; index < this.tokens.length; index++) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				if ('?' === this.tokens[index].value) {
					const logical = this.getTokenValue(index - 1);
					const ifTrue = this.getTokenValue(index + 1);
					if (this.tokens[index + 2].value !== ':') {
						throw new Error(`not ternary operator`);
					}
					const ifFalse = this.getTokenValue(index + 3);
					const ternary = new Token(
						TokenType.EXPRESSION,
						new TernaryNode(logical, ifTrue, ifFalse)
					);
					this.tokens.splice(index - 1, 5, ternary);
					index -= 2;
				}
			}
		}
	}
	// parseYield(){}
	// parseYieldAstr(){}
	parseCommaSequence() {
		for (let index = 0; index < this.tokens.length; index++) {
			if (this.tokens[index].type === TokenType.COMMA) {
				const expressions: ExpressionNode[] = [];
				const start = index - 1;
				expressions.push(this.tokens[start].value as ExpressionNode);
				for (++index; index < this.tokens.length; index++) {
					if (this.tokens[index].type === TokenType.COMMA) {
						continue;
					}
					if (this.tokens[index].type === TokenType.SEMICOLON ||
						this.tokens[index].type === TokenType.EOF) {
						break;
					}
					expressions.push(this.getTokenValue(index));
				}
				const ternary = new Token(TokenType.EXPRESSION, new CommaNode(expressions));
				this.tokens.splice(start, (expressions.length * 2) - 1, ternary);
				index = start;
			}
		}
	}
	private parseInfixNodeType(nodeType: NodeExpressionClass<ExpressionNode>): void {
		for (let index = 1; index < this.tokens.length - 1; index++) {
			if (this.tokens[index].type === TokenType.OPERATOR) {
				if (nodeType.KEYWORDS!.includes(this.tokens[index].value as string) &&
					this.tokens[index - 1].isPropOrExp() &&
					this.tokens[index + 1].isPropOrExp()) {
					const temp = new Token(
						TokenType.EXPRESSION,
						new nodeType(
							this.tokens[index].value as string,
							this.getTokenValue(index - 1),
							this.getTokenValue(index + 1)
						)
					);
					this.tokens.splice(index - 1, 3, temp);
					index--;
				}
			}
		}
	}
}

export class Parser {
	parse(expression: string) {
		const stream: TokenStream = TokenStream.getTokenStream(expression);
		const tokens: Token[] = stream.toTokens();
		tokens.forEach(t => console.log(t));
		const tokenParser = new OperatorParser(tokens);
		tokenParser.scan();
		return tokens;
	}

}

try {
	const parser = new Parser();
	let statement: string;
	// statement = `x.y?.zp[4]`;
	// statement = `9 + ( 2 * 3 - (5+6) + (4 / 8))`;
	// statement = `for (let index = 0; index < array.length; index++) {const element = array[index];}`;
	// statement = `const iterator of object; index as id; even as isEven;`;
	// statement = `switch (key) {case 'a': console.log('value'); break; default: break;}`;
	// statement = `y = true ? 6 : 7`;

	// statement = `((x.y.z[4]['abc']))`;
	// statement = `x?.y.z.r = y + d`;
	// statement = `x.y > 8 ? (a = b + c): (a = b + (9 |> Math.trunc))`;
	// statement = `x |> max:6:7:?:55`;
	// statement = `x |> max(6, 7, ?, 55)`;
	// statement = `x.y = 6, v.g = 9, df.gh = -44`;
	// statement = `delete x.y.v`;
	// statement = `x.y.d?.dd(3,4)`;
	// statement = `x + ++t +y`;
	// statement = `+y`;
	// statement = `new x(y,u,6,4, '5555')`;
	statement = `new className(x, u(x?(y = 89):u??g), t||v)`;

	console.log(statement);
	const tokensJS = parser.parse(statement);
	const stack = ScopeProvider.for({});
	Reflect.set(window, 'parser', parser.parse);
	Reflect.set(window, 'tokens', tokensJS);
	Reflect.set(window, 'stack', stack);
	Reflect.set(window, 'getTokenStream', TokenStream.getTokenStream);
	console.log(tokensJS[0].value);
} catch (error) {
	console.error(error);
}
