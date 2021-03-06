import type { ExpressionNode } from '../api/expression.js';
import { Token, TokenExpression } from './token.js';
import { PreTemplateLiteral, TokenStream } from './stream.js';
import {
	OfNode, IdentifierNode, ThisNode, GetIdentifier, SetIdentifier,
	AsyncIdentifier, NullNode, TemplateLiteralsNode, StringNode
} from '../api/definition/values.js';
import { EmptyNode } from '../api/statement/controlflow/empty.js';
import { BlockNode } from '../api/statement/controlflow/block.js';
import {
	ArrowFunctionNode, ArrowFunctionType, FunctionDeclarationNode,
	FunctionType, FormalParamterNode
} from '../api/definition/function.js';
import { IfElseNode } from '../api/statement/controlflow/if.js';
import { NewNode } from '../api/computing/new.js';
import { SpreadNode } from '../api/computing/spread.js';
import { AssignmentNode } from '../api/operators/assignment.js';
import { GroupingNode } from '../api/operators/grouping.js';
import { AccessNode, ComputedMemberAccessNode, MemberAccessNode } from '../api/definition/member.js';
import {
	GetPropertyNode, ObjectLiteralNode,
	ObjectLiteralPropertyNode, SetPropertyNode
} from '../api/definition/object.js';
import { ArrayLiteralNode } from '../api/definition/array.js';
import { FunctionCallNode } from '../api/computing/call.js';
import { DoWhileNode, WhileNode } from '../api/statement/iterations/while.js';
import { ThrowNode, TryCatchNode } from '../api/computing/throw.js';
import { CaseExpression, DefaultExpression, SwitchNode } from '../api/statement/controlflow/switch.js';
import { TerminateNode } from '../api/statement/controlflow/terminate.js';
import { ReturnNode } from '../api/computing/return.js';
import { ConstNode, LetNode, Variable } from '../api/statement/declarations/declares.js';
import { ForNode, ForOfNode, ForInNode, ForAwaitOfNode } from '../api/statement/iterations/for.js';
import { TernaryNode } from '../api/operators/ternary.js';
import { PipelineNode } from '../api/operators/pipeline.js';
import { LogicalNode } from '../api/operators/logical.js';
import { CommaNode } from '../api/operators/comma.js';
import { OptionalChainingNode } from '../api/operators/chaining.js';
import { StatementNode } from '../api/definition/statement.js';
import {
	buildPostfixExpression, buildUnaryExpression,
	expressionFromLiteral, shortcutNumericLiteralBinaryExpression
} from './nodes.js';
import { RelationalNode } from '../api/operators/relational.js';

enum ParsingArrowHeadFlag { CertainlyNotArrowHead, MaybeArrowHead, AsyncArrowFunction }
enum PropertyKind {
	Value, Shorthand, ShorthandOrClassField,
	Assign, Method, ClassField, AccessorGetter, AccessorSetter,
	Spread, NotSet
}
type PropertyKindInfo = { kind?: PropertyKind, funcFlag?: FunctionType/*, name?: ExpressionNode */ };
type FunctionInfo = { rest?: boolean };
function parsePropertyKindFromToken(token: Token, info: PropertyKindInfo) {
	switch (token) {
		case Token.COLON:
			info.kind = PropertyKind.Value;
			return true;
		case Token.COMMA:
			info.kind = PropertyKind.Shorthand;
			return true;
		case Token.R_CURLY:
			info.kind = PropertyKind.ShorthandOrClassField;
			return true;
		case Token.ASSIGN:
			info.kind = PropertyKind.Assign;
			return true;
		case Token.L_PARENTHESES:
			info.kind = PropertyKind.Method;
			return true;
		case Token.MUL:
		case Token.SEMICOLON:
			info.kind = PropertyKind.ClassField;
			return true;
		default:
			break;
	}
	return false;
}

export abstract class AbstractParser {
	constructor(protected scanner: TokenStream) { }
	abstract scan(): ExpressionNode;
	protected position() {
		return this.scanner.getPos();
	}
	protected next() {
		return this.scanner.next();
	}
	protected peek(): TokenExpression {
		return this.scanner.peek();
	}
	protected peekAhead(): TokenExpression {
		return this.scanner.peekAhead();
	}
	protected peekAheadPosition() {
		return this.scanner.peekAheadPosition();
	}
	protected peekPosition() {
		return this.scanner.peekPosition();
	}
	protected consume(token: Token) {
		if (this.scanner.next().isNotType(token)) {
			throw new Error(this.errorMessage(`Parsing ${JSON.stringify(token)}`));
		}
	}
	protected check(token: Token): boolean {
		const next = this.scanner.peek();
		if (next.isType(token)) {
			this.scanner.next();
			return true;
		}
		return false;
	}
	protected checkValue(value: ExpressionNode): boolean {
		const next = this.scanner.peek();
		if (next.value == value) {
			this.scanner.next();
			return true;
		}
		return false;
	}
	protected expect(token: Token) {
		const current = this.scanner.next();
		if (current.isNotType(token)) {
			throw new Error(this.errorMessage(`Unexpected Token: ${JSON.stringify(token)}, current is ${JSON.stringify(current)}`));
		}
	}
	protected checkInOrOf(): 'IN' | 'OF' | false {
		if (this.check(Token.IN)) {
			return 'IN';
		} else if (this.checkValue(OfNode)) {
			return 'OF';
		}
		return false;
	}
	protected peekInOrOf(): 'IN' | 'OF' | false {
		var next = this.peek();
		if (next.isType(Token.IN)) {
			return 'IN';
		} else if (next.value === OfNode) {
			return 'OF';
		}
		return false;
	}
	protected isEvalOrArguments(name: ExpressionNode): boolean {
		if (name.toString() === 'eval') {
			return true;
		} else if (name.toString() === 'arguments') {
			return true;
		}
		return false;
	}
	protected isNextLetKeyword() {
		if (this.peek().isNotType(Token.LET)) {
			return false;
		}
		const nextNextToken = this.peekAhead().token;
		switch (nextNextToken) {
			case Token.L_CURLY:
			case Token.L_BRACKETS:
			case Token.IDENTIFIER:
			case Token.STATIC:
			case Token.LET:  // `let let;` is disallowed by static semantics, but the
			// token must be first interpreted as a keyword in order
			// for those semantics to apply. This ensures that ASI is
			// not honored when a LineTerminator separates the
			// tokens.
			case Token.YIELD:
			case Token.AWAIT:
			case Token.GET:
			case Token.SET:
			case Token.ASYNC:
				return true;
			default:
				return false;
		}
	}
	protected isIdentifier(expression: ExpressionNode): expression is IdentifierNode {
		return expression instanceof IdentifierNode;
	}
	protected isParenthesized(expression: ExpressionNode): expression is (GroupingNode | CommaNode) {
		return expression instanceof GroupingNode || expression instanceof CommaNode;
	}
	protected isAssignableIdentifier(expression: ExpressionNode): boolean {
		// return expression instanceof AssignmentNode;
		if (!(expression instanceof IdentifierNode)) {
			return false;
		}
		if (this.isEvalOrArguments(expression)) {
			return false;
		}
		return true;
	}
	protected isPattern(expression: ExpressionNode): expression is (ObjectLiteralNode | ArrayLiteralNode) {
		return expression instanceof ObjectLiteralNode || expression instanceof ArrayLiteralNode;
	}
	protected isProperty(expression: ExpressionNode): expression is (MemberAccessNode | ComputedMemberAccessNode) {
		return expression instanceof MemberAccessNode || expression instanceof ComputedMemberAccessNode;
	}
	protected isCallNew(expression: ExpressionNode): expression is NewNode {
		return expression instanceof NewNode;
	}
	protected isCall(expression: ExpressionNode): expression is FunctionCallNode {
		return expression instanceof FunctionCallNode;
	}
	protected isEmptyStatement(expression: ExpressionNode): expression is EmptyNode {
		return expression instanceof EmptyNode;
	}
	protected isThisProperty(expression: ExpressionNode): boolean {
		if (this.isProperty(expression)) {
			if (expression.getLeft() === ThisNode || expression.getLeft().toString() === 'this') {
				return true;
			}
		}
		return false;
	}
	protected isValidReferenceExpression(expression: ExpressionNode): boolean {
		return this.isAssignableIdentifier(expression) || this.isProperty(expression);
	}
	protected expectSemicolon() {
		const tok = this.peek();
		if (tok.isType(Token.SEMICOLON)) {
			this.next();
			return;
		}
		if (this.scanner.hasLineTerminatorBeforeNext() || Token.isAutoSemicolon(tok.token)) {
			return;
		}
		if (this.scanner.currentToken().isType(Token.AWAIT)) {
			throw new Error(this.errorMessage(`Await Not In Async Context/Function`));
		}
	}
	protected errorMessage(message: string): string {
		return this.scanner.createError(message);
	}
}

export class JavaScriptParser extends AbstractParser {
	static parse(app: string) {
		const stream = TokenStream.getTokenStream(app);
		const parser = new JavaScriptParser(stream);
		return parser.scan();
	}
	scan(): ExpressionNode {
		const list: ExpressionNode[] = this.parseStatementList(Token.EOS);
		if (list.length === 1) {
			return list[0];
		}
		return new StatementNode(list);
	}

	/**
	 * Statement ::
	 * Block
	 * VariableStatement
	 * EmptyStatement
	 * ExpressionStatement
	 * IfStatement
	 * IterationStatement
	 * ContinueStatement
	 * BreakStatement
	 * ReturnStatement
	 * WithStatement
	 * LabelledStatement
	 * SwitchStatement
	 * ThrowStatement
	 * TryStatement
	 * DebuggerStatement
	 */
	protected parseStatement(): ExpressionNode {
		switch (this.peek().token) {
			case Token.L_CURLY:
				return this.parseBlock();
			case Token.SEMICOLON:
				this.consume(Token.SEMICOLON);
				return EmptyNode.INSTANCE;
			case Token.IF:
				return this.parseIfStatement();
			case Token.DO:
				return this.parseDoWhileStatement();
			case Token.WHILE:
				return this.parseWhileStatement();
			case Token.FOR:
				// if (this.peekAhead().isType(Token.AWAIT)) {
				// 	return this.parseForAwaitStatement();
				// }
				return this.parseForStatement();
			case Token.CONTINUE:
				return this.parseContinueStatement();
			case Token.BREAK:
				return this.parseBreakStatement();
			case Token.RETURN:
				return this.parseReturnStatement();
			case Token.THROW:
				return this.parseThrowStatement();
			case Token.TRY:
				return this.parseTryStatement();
			case Token.SWITCH:
				return this.parseSwitchStatement();
			// case Token.FUNCTION:
			// 	// FunctionDeclaration only allowed as a StatementListItem, not in
			// 	// an arbitrary Statement position. Exceptions such as
			// 	// ES#sec-functiondeclarations-in-ifstatement-statement-clauses
			// 	// are handled by calling ParseScopedStatement rather than
			// 	// ParseStatement directly.
			// 	impl() -> ReportMessageAt(scanner() -> peek_location(),
			// 		is_strict(language_mode())
			// 			? MessageTemplate.kStrictFunction
			// 			: MessageTemplate.kSloppyFunction);
			// 	return impl() -> NullStatement();
			case Token.VAR:
			case Token.LET:
			case Token.CONST:
				return this.parseVariableDeclarations();
			case Token.ASYNC:
				if (this.peekAhead().isType(Token.FUNCTION)) {
					this.consume(Token.ASYNC);
					this.consume(Token.FUNCTION);
					if (this.peek().isType(Token.MUL)) {
						return this.parseFunctionExpression(FunctionType.ASYNC_GENERATOR);
					}
					return this.parseFunctionExpression(FunctionType.ASYNC);
				}
			default:
				return this.parseExpressionOrLabelledStatement();
		}
	}
	protected parseTryStatement(): ExpressionNode {
		// TryStatement ::
		//   'try' Block Catch
		//   'try' Block Finally
		//   'try' Block Catch Finally
		//
		// Catch ::
		//   'catch' '(' Identifier ')' Block
		//
		// Finally ::
		//   'finally' Block

		this.consume(Token.TRY);
		const tryBlock = this.parseBlock();
		if (tryBlock instanceof BlockNode) {
			tryBlock.isStatement = true;
		}
		let peek = this.peek();
		if (peek.isNotType(Token.CATCH) && peek.isNotType(Token.FINALLY)) {
			throw new Error(this.errorMessage(`Uncaught SyntaxError: Missing catch or finally after try`));
		}
		let catchVar: ExpressionNode | undefined, catchBlock: ExpressionNode | undefined;
		if (this.check(Token.CATCH)) {
			// bool has_binding;
			const hasBinding = this.check(Token.L_PARENTHESES);
			if (hasBinding) {
				catchVar = this.parseIdentifier();
				this.expect(Token.R_PARENTHESES);
			}
			catchBlock = this.parseBlock();
			if (catchBlock instanceof BlockNode) {
				catchBlock.isStatement = true;
			}
		}
		let finallyBlock: ExpressionNode | undefined;
		if (this.check(Token.FINALLY)) {
			finallyBlock = this.parseBlock();
			if (finallyBlock instanceof BlockNode) {
				finallyBlock.isStatement = true;
			}
		}
		return new TryCatchNode(tryBlock, catchVar, catchBlock, finallyBlock);
	}
	protected parseBlock(): ExpressionNode {
		this.expect(Token.L_CURLY);
		const statements: ExpressionNode[] = [];
		const block = new BlockNode(statements, false);
		while (this.peek().isNotType(Token.R_CURLY)) {
			const stat = this.parseStatementListItem();
			if (!stat) {
				return block;
			} else if (stat instanceof EmptyNode) {
				continue;
			}
			statements.push(stat);
		}
		this.expect(Token.R_CURLY);
		return block;
	}
	/**
	 * ECMA 262 6th Edition
	 * 	StatementListItem[Yield, Return] :
	 * 	Statement[?Yield, ?Return]
	 * 	Declaration[?Yield]
	 * //
	 * Declaration[Yield] :
	 * 	HoistableDeclaration[?Yield]
	 * 	ClassDeclaration[?Yield]
	 * 	LexicalDeclaration[In, ?Yield]
	 * //
	 * HoistableDeclaration[Yield, Default] :
	 * 	FunctionDeclaration[?Yield, ?Default]
	 * 	GeneratorDeclaration[?Yield, ?Default]
	 * //
	 * LexicalDeclaration[In, Yield] :
	 * 	LetOrConst BindingList[?In, ?Yield] ;
	 */
	protected parseStatementListItem(): ExpressionNode | undefined {
		switch (this.peek().token) {
			case Token.FUNCTION:
				this.consume(Token.FUNCTION);
				if (this.peek().isType(Token.MUL)) {
					this.consume(Token.MUL);
					return this.parseFunctionExpression(FunctionType.GENERATOR);
				}
				return this.parseFunctionExpression(FunctionType.NORMAL);
			case Token.CLASS:
				this.consume(Token.CLASS);
				// return this.parseClassDeclaration();
				throw new Error(this.errorMessage(`'class': not supported now`));
			case Token.VAR:
			case Token.LET:
			case Token.CONST:
				return this.parseVariableDeclarations();
			case Token.ASYNC:
				if (this.peekAhead().isType(Token.FUNCTION)) {
					this.consume(Token.ASYNC);
					this.consume(Token.FUNCTION);
					if (this.peek().isType(Token.MUL)) {
						this.consume(Token.MUL);
						return this.parseFunctionExpression(FunctionType.ASYNC_GENERATOR);
					}
					return this.parseFunctionExpression(FunctionType.ASYNC);
				}
				break;
			default:
				break;
		}
		return this.parseStatement();
	}
	protected parseFunctionExpression(type: FunctionType): ExpressionNode {
		let funcName: ExpressionNode | undefined;
		const peek = this.peek();
		if (peek.isNotType(Token.L_PARENTHESES)) {
			if (peek.isType(Token.L_BRACKETS)) {
				// [Symbol.iterator]() {}
				this.consume(Token.L_BRACKETS);
				funcName = this.parseMemberExpression();
				this.expect(Token.R_BRACKETS);
			} else {
				funcName = this.parseIdentifier();
			}
		}
		return this.parseFunctionLiteral(type, funcName);
	}
	protected parseIfStatement(): ExpressionNode {
		this.consume(Token.IF);
		this.consume(Token.L_PARENTHESES);
		const condition = this.parseExpression();
		this.consume(Token.R_PARENTHESES);
		const thenStatement = this.parseStatement();
		if (thenStatement instanceof BlockNode) {
			thenStatement.isStatement = true;
		}
		let elseStatement;
		if (this.peek().isType(Token.ELSE)) {
			this.consume(Token.ELSE);
			elseStatement = this.parseStatement();
		}
		return new IfElseNode(condition, thenStatement, elseStatement);
	}
	protected parseDoWhileStatement(): ExpressionNode {
		// DoStatement ::
		//   'do' Statement 'while' '(' Expression ')' ';'
		this.consume(Token.DO);
		const body = this.parseStatement();
		if (body instanceof BlockNode) {
			body.isStatement = true;
		}
		this.expect(Token.WHILE);
		this.expect(Token.L_PARENTHESES);
		const condition = this.parseExpression();
		this.expect(Token.R_PARENTHESES);
		this.check(Token.SEMICOLON);
		return new DoWhileNode(condition, body);
	}
	protected parseWhileStatement(): ExpressionNode {
		// WhileStatement ::
		//   'while' '(' Expression ')' Statement
		this.consume(Token.WHILE);
		this.expect(Token.L_PARENTHESES);
		const condition = this.parseExpression();
		this.expect(Token.R_PARENTHESES);
		const body = this.parseStatement();
		if (body instanceof BlockNode) {
			body.isStatement = true;
		}
		return new WhileNode(condition, body);
	}
	protected parseThrowStatement(): ExpressionNode {
		// ThrowStatement ::
		//   'throw' Expression ';'
		this.consume(Token.THROW);
		if (this.scanner.hasLineTerminatorBeforeNext()) {
			throw new Error(this.scanner.createError(`New line After Throw`));
		}
		const exception = this.parseExpression();
		this.expectSemicolon();
		return new ThrowNode(exception);
	}
	protected parseSwitchStatement(): ExpressionNode {
		// SwitchStatement ::
		//   'switch' '(' Expression ')' '{' CaseClause* '}'
		// CaseClause ::
		//   'case' Expression ':' StatementList
		//   'default' ':' StatementList

		this.consume(Token.SWITCH);
		this.expect(Token.L_PARENTHESES);
		const tag = this.parseExpression();
		this.expect(Token.R_PARENTHESES);

		const cases: CaseExpression[] = [];
		const switchStatement = new SwitchNode(tag, cases);

		let defaultSeen = false;
		this.expect(Token.L_CURLY);
		while (this.peek().isNotType(Token.R_CURLY)) {
			const statements: ExpressionNode[] = [];
			let label: ExpressionNode;
			if (this.check(Token.CASE)) {
				label = this.parseExpression();
			} else {
				this.expect(Token.DEFAULT);
				if (defaultSeen) {
					throw new Error(this.errorMessage(`Multiple Defaults In Switch`));
				}
				defaultSeen = true;
			}
			this.expect(Token.COLON);
			while (this.peek().isNotType(Token.CASE)
				&& this.peek().isNotType(Token.DEFAULT)
				&& this.peek().isNotType(Token.R_CURLY)) {
				const statement = this.parseStatementListItem();
				if (!statement || this.isEmptyStatement(statement)) {
					continue;
				}
				statements.push(statement);
			}
			const block = new BlockNode(statements, true);
			const clause = defaultSeen ? new DefaultExpression(block) : new CaseExpression(label!, block);
			cases.push(clause);
		}
		this.expect(Token.R_CURLY);
		return switchStatement;
	}
	protected parseForStatement(): ExpressionNode {
		// Either a standard for loop
		//   for (<init>; <cond>; <next>) { ... }
		// or a for-each loop
		//   for (<each> of|in <iterable>) { ... }
		//

		this.consume(Token.FOR);
		const isAwait = this.check(Token.AWAIT);
		this.expect(Token.L_PARENTHESES);
		const peek = this.peek();
		const startsWithLet = peek.isType(Token.LET) || peek.isType(Token.VAR);
		let initializer: ExpressionNode;
		if (peek.isType(Token.CONST) || (startsWithLet && this.isNextLetKeyword())) {
			initializer = this.parseVariableDeclarations();
		} else if (peek.isType(Token.SEMICOLON)) {
			initializer = EmptyNode.INSTANCE;
		} else {
			initializer = this.parseExpressionCoverGrammar();
		}
		if (initializer instanceof RelationalNode) {
			// x in y 
			const objectNode = initializer.getRight();
			initializer = initializer.getLeft();
			this.expect(Token.R_PARENTHESES)
			const statement = this.parseStatement();
			return new ForInNode(initializer, objectNode, statement);
		}
		const forMode = this.checkInOrOf();
		if (forMode) {
			const object = forMode === 'IN' ? this.parseAssignmentExpression() : this.parseExpression();
			this.expect(Token.R_PARENTHESES)
			const statement = this.parseStatement();
			if (statement instanceof BlockNode) {
				statement.isStatement = true;
			}
			if (isAwait && forMode === 'OF') {
				return new ForAwaitOfNode(initializer, object, statement);
			} else if (forMode === 'OF') {
				return new ForOfNode(initializer, object, statement);
			} else if (forMode === 'IN') {
				return new ForInNode(initializer, object, statement);
			} else {
				throw new Error(this.errorMessage(`parsing for loop: ${this.position()}`));
			}
		}
		this.expect(Token.SEMICOLON);
		let condition: ExpressionNode | undefined;
		if (!this.check(Token.SEMICOLON)) {
			condition = this.parseExpression();
			this.expect(Token.SEMICOLON);
		}
		let finalExpression: ExpressionNode | undefined;
		if (!this.check(Token.R_PARENTHESES)) {
			finalExpression = this.parseExpression();
			this.expect(Token.R_PARENTHESES);
		}
		const body = this.parseStatement();
		if (body instanceof BlockNode) {
			body.isStatement = true;
		}
		return new ForNode(body, initializer, condition, finalExpression);
	}
	protected parseVariableDeclarations(): ExpressionNode {
		// VariableDeclarations ::
		//   ('var' | 'const' | 'let') (Identifier ('=' AssignmentExpression)?)+[',']
		// var converted into ==> 'let' by parser

		let mode: 'const' | 'let';
		const token = this.peek().token;
		switch (token) {
			case Token.CONST:
				this.consume(token);
				mode = 'const';
				break;
			case Token.VAR:
			case Token.LET:
			default:
				this.consume(token);
				mode = 'let';
				break;
		}
		const variables: Variable[] = [];
		do {

			let name: ExpressionNode;
			let value: ExpressionNode | undefined;
			// Check for an identifier first, so that we can elide the pattern in cases
			// where there is no initializer (and so no proxy needs to be created).
			if (Token.isAnyIdentifier(this.peek().token)) {
				name = this.parseAndClassifyIdentifier(this.next());
				if (this.isEvalOrArguments(name)) {
					throw new Error(this.errorMessage(`Strict Eval Arguments`));
				}
				// if (this.peekInOrOf()) {
				// 	// // Assignments need the variable expression for the assignment LHS, and
				// 	// // for of/in will need it later, so create the expression now.
				// }
			} else {
				name = this.parseBindingPattern();
			}

			if (this.check(Token.ASSIGN)) {
				value = this.parseAssignmentExpression();
			} else if (!this.peekInOrOf()) {
				// ES6 'const' and binding patterns require initializers.
				if (mode === 'const' && (name === undefined || value === undefined)) {
					throw new Error(this.errorMessage(`Declaration Missing Initializer : ${this.position()}`));
				}
				// value = undefined;
			}
			variables.push(new Variable(name, value));
		} while (this.check(Token.COMMA));

		if (mode === 'const') {
			return new ConstNode(variables);
		} else {
			return new LetNode(variables);
		}
	}
	protected parseBindingPattern(): ExpressionNode {
		// Pattern ::
		//   Identifier
		//   ArrayLiteral
		//   ObjectLiteral

		const token = this.peek().token;
		if (Token.isAnyIdentifier(token)) {
			const name = this.parseAndClassifyIdentifier(this.next());
			if (this.isEvalOrArguments(name)) {
				throw new Error(this.errorMessage(`Strict Eval Arguments`));
			}
			return name;
		}
		if (token == Token.L_BRACKETS) {
			return this.parseArrayLiteral();
		} else if (token == Token.L_CURLY) {
			return this.parseObjectLiteral();
		} else {
			this.next();
			throw new Error(this.errorMessage(`Unexpected Token`));
		}
	}
	protected parseAndClassifyIdentifier(next: TokenExpression): ExpressionNode {
		if (next.isType(Token.IDENTIFIER)) {
			return next.getValue();
		}
		else if (next.isType(Token.SET)) {
			const value = this.parseFunctionDeclaration();
			return new SetPropertyNode(next.getValue(), value);
		}
		else if (next.isType(Token.GET)) {
			const value = this.parseFunctionDeclaration();
			return new GetPropertyNode(next.getValue(), value);
		}
		else if (next.isType(Token.AWAIT)) {
			throw new Error(this.errorMessage(`un supported expression (await)`));

		}
		return next.getValue();
	}
	protected parseContinueStatement(): ExpressionNode {
		// ContinueStatement ::
		//   'continue' ';'
		// Identifier? is not supported

		this.consume(Token.CONTINUE);
		this.expectSemicolon();
		return TerminateNode.CONTINUE_INSTANCE;
	}
	protected parseBreakStatement(): ExpressionNode {
		// BreakStatement ::
		//   'break' ';'
		// Identifier? is not supported

		this.consume(Token.BREAK);
		this.expectSemicolon();
		return TerminateNode.BREAK_INSTANCE;
	}
	protected parseReturnStatement(): ExpressionNode {
		// ReturnStatement ::
		//   'return' [no line terminator] Expression? ';'

		// Consume the return token. It is necessary to do that before
		// reporting any errors on it, because of the way errors are
		// reported (underlining).
		this.consume(Token.RETURN);
		const tokenExp = this.peek();
		let returnValue: ExpressionNode | undefined;
		// ExpressionT return_value = impl() -> NullExpression();
		if (this.scanner.hasLineTerminatorBeforeNext() || Token.isAutoSemicolon(tokenExp.token)) {
			// check if this scope is belong to 'constructor' method to return this at the end;
			// if (this.isDerivedConstructor(function_state_ -> kind())) {
			// 	returnValue = ThisNode;
			// }
		} else {
			returnValue = this.parseExpression();
		}
		this.expectSemicolon()
		return new ReturnNode(returnValue);
	}
	protected parseExpressionOrLabelledStatement(): ExpressionNode {
		// ExpressionStatement | LabelledStatement ::
		//   Expression ';'
		//   Identifier ':' Statement
		//
		// ExpressionStatement[Yield] :
		//   [lookahead notin {{, function, class, let [}] Expression[In, ?Yield] ;

		switch (this.peek().token) {
			case Token.FUNCTION:
			case Token.L_CURLY:
				throw new Error(this.errorMessage(`Unreachable state`));
			case Token.CLASS:
				throw new Error(this.errorMessage(`Unexpected Token ${this.next().getValue().toString()}`));
			case Token.LET: {
				const nextNext = this.peekAhead();
				// "let" followed by either "[", "{" or an identifier means a lexical
				// declaration, which should not appear here.
				// However, ASI may insert a line break before an identifier or a brace.
				if (nextNext.isNotType(Token.L_BRACKETS) &&
					((nextNext.isNotType(Token.L_CURLY) && nextNext.isNotType(Token.IDENTIFIER)))) {
					break;
				}
				throw new Error(this.errorMessage(`Unexpected Lexical Declaration ${this.position()}`));
			}
			default:
				break;
		}
		const startsWithIdentifier = Token.isAnyIdentifier(this.peek().token);
		const expression: ExpressionNode = this.parseExpressionCoverGrammar();
		if (this.peek().isType(Token.COLON) && startsWithIdentifier && this.isIdentifier(expression)) {
			// The whole expression was a single identifier, and not, e.g.,
			// something starting with an identifier or a parenthesized identifier.

			// Remove the "ghost" variable that turned out to be a label from the top
			// scope. This way, we don't try to resolve it during the scope
			// processing.

			this.consume(Token.COLON);
			// ES#sec-labelled-function-declarations Labelled Function Declarations
			if (this.peek().isType(Token.FUNCTION) /*&& allow_function == kAllowLabelledFunctionStatement */) {
				return this.parseFunctionDeclaration();
			}
			return this.parseStatement();
		}
		// Parsed expression statement, followed by semicolon.
		this.expectSemicolon();
		return expression;
	}
	protected parseExpression(): ExpressionNode {
		return this.parseExpressionCoverGrammar();
	}
	protected parseFunctionDeclaration(): ExpressionNode {
		this.consume(Token.FUNCTION);
		if (this.check(Token.MUL)) {
			throw new Error(this.errorMessage(`Error Generator In Single Statement Context`));
		}
		return this.parseHoistableDeclaration(FunctionType.NORMAL);
	}
	protected parseFunctionDeclarationAndGenerator() {
		this.consume(Token.FUNCTION);
		if (this.check(Token.MUL)) {
			return this.parseHoistableDeclaration(FunctionType.GENERATOR);
		}
		return this.parseHoistableDeclaration(FunctionType.NORMAL);
	}
	protected parseHoistableDeclaration(flag: FunctionType): ExpressionNode {
		// FunctionDeclaration ::
		//   'function' Identifier '(' FormalParameters ')' '{' FunctionBody '}'
		//   'function' '(' FormalParameters ')' '{' FunctionBody '}'
		// GeneratorDeclaration ::
		//   'function' '*' Identifier '(' FormalParameters ')' '{' FunctionBody '}'
		//   'function' '*' '(' FormalParameters ')' '{' FunctionBody '}'
		//
		// The anonymous forms are allowed iff [default_export] is true.
		//
		// 'function' and '*' (if present) have been consumed by the caller.

		// (FunctionType.ASYNC === flag || FunctionType.GENERATOR === flag);

		if (FunctionType.ASYNC === flag && this.check(Token.MUL)) {
			// Async generator
			flag = FunctionType.ASYNC_GENERATOR;
		}
		let name: ExpressionNode | undefined;
		if (this.peek().isNotType(Token.L_PARENTHESES)) {
			name = this.parseIdentifier();
		}
		return this.parseFunctionLiteral(flag, name);
	}
	protected parseIdentifier(): ExpressionNode | undefined {
		const peek = this.peek();
		if (peek.getValue() instanceof IdentifierNode) {
			return this.next().getValue();
		}
		return void 0;
	}
	protected parseFunctionLiteral(flag: FunctionType, name?: ExpressionNode): ExpressionNode {
		// Function ::
		//   '(' FormalParameterList? ')' '{' FunctionBody '}'

		const functionInfo: FunctionInfo = {};
		this.expect(Token.L_PARENTHESES);
		const formals: ExpressionNode[] = this.parseFormalParameterList(functionInfo);
		this.expect(Token.R_PARENTHESES);
		const body = this.parseFunctionBody();
		return new FunctionDeclarationNode(formals, body, flag, name, functionInfo.rest);
	}
	protected parseFunctionBody(): ExpressionNode[] {
		const isExpression = this.peek().isNotType(Token.L_CURLY);
		if (isExpression) {
			const expression = this.parseAssignmentExpression();
			return [expression];
		} else {
			this.expect(Token.L_CURLY);
			const list = this.parseStatementList(Token.R_CURLY);
			this.expect(Token.R_CURLY);
			return list;
		}
	}
	protected parseStatementList(endToken: Token): ExpressionNode[] {
		// StatementList ::
		//   (StatementListItem)* <end_token>
		const list: ExpressionNode[] = [];
		while (this.peek().isNotType(endToken)) {
			const stat = this.parseStatementListItem();
			if (!stat) {
				break;
			}
			if (this.isEmptyStatement(stat)) {
				continue;
			}
			list.push(stat);
		}
		return list;
	}
	protected parseFormalParameterList(functionInfo: FunctionInfo): ExpressionNode[] {
		// FormalParameters[Yield] :
		//   [empty]
		//   FunctionRestParameter[?Yield]
		//   FormalParameterList[?Yield]
		//   FormalParameterList[?Yield] ,
		//   FormalParameterList[?Yield] , FunctionRestParameter[?Yield]
		//
		// FormalParameterList[Yield] :
		//   FormalParameter[?Yield]
		//   FormalParameterList[?Yield] , FormalParameter[?Yield]

		const parameters: ExpressionNode[] = [];
		if (this.peek().isNotType(Token.R_PARENTHESES)) {
			while (true) {
				const param: ExpressionNode = this.parseFormalParameter(functionInfo);
				parameters.push(param);
				if (functionInfo.rest) {
					if (this.peek().isType(Token.COMMA)) {
						throw new Error(this.errorMessage(`Param After Rest`));
					}
					break;
				}
				if (!this.check(Token.COMMA)) break;
				if (this.peek().isType(Token.R_PARENTHESES)) {
					// allow the trailing comma
					break;
				}
			}
		}
		return parameters;
	}
	protected parseFormalParameter(functionInfo: FunctionInfo): ExpressionNode {
		// FormalParameter[Yield,GeneratorParameter] :
		//   BindingElement[?Yield, ?GeneratorParameter]
		functionInfo.rest = this.check(Token.ELLIPSIS);
		let pattern = this.parseBindingPattern();
		let initializer: FormalParamterNode;
		if (this.check(Token.ASSIGN)) {
			if (functionInfo.rest) {
				throw new Error(this.errorMessage(`Rest Default Initializer`));
			}
			const value = this.parseAssignmentExpression();
			initializer = new FormalParamterNode(pattern, value);
		} else {
			initializer = new FormalParamterNode(pattern);
		}
		return initializer;
	}
	protected parseExpressionCoverGrammar(info?: FunctionInfo): ExpressionNode {
		// Expression ::
		//   AssignmentExpression
		//   Expression ',' AssignmentExpression

		// ExpressionListT list(pointer_buffer());
		// ExpressionT expression;
		// AccumulationScope accumulation_scope(expression_scope());
		let variableIndex = 0;
		const list: ExpressionNode[] = [];
		let expression: ExpressionNode;
		while (true) {
			if (this.peek().isType(Token.ELLIPSIS)) {
				if (info) {
					info.rest = true;
				}
				return this.parseArrowParametersWithRest(list, variableIndex);
			}
			expression = this.parseAssignmentExpressionCoverGrammar();
			list.push(expression);

			if (!this.check(Token.COMMA)) break;

			if (this.peek().isType(Token.R_PARENTHESES) && this.peekAhead().isType(Token.ARROW)) {
				// a trailing comma is allowed at the end of an arrow parameter list
				break;
			}
		}
		if (list.length == 1) return expression;
		return this.expressionListToExpression(list);
	}
	protected parseArrowParametersWithRest(list: ExpressionNode[], variableIndex: number): ExpressionNode {
		this.consume(Token.ELLIPSIS);
		const pattern: ExpressionNode = this.parseBindingPattern();
		if (this.peek().isType(Token.ASSIGN)) {
			throw new Error(this.errorMessage(`Error A rest parameter cannot have an initializer`));
		}
		if (this.peek().isType(Token.COMMA)) {
			throw new Error(this.errorMessage(`Error A rest parameter or binding pattern may not have a trailing comma`));
		}
		// 'x, y, ...z' in CoverParenthesizedExpressionAndArrowParameterList only
		// as the formal parameters of'(x, y, ...z) => foo', and is not itself a
		// valid expression.
		if (this.peek().isNotType(Token.R_PARENTHESES) || this.peekAhead().isNotType(Token.ARROW)) {
			throw new Error(this.errorMessage(`Error Unexpected Token At ${this.position()}`));
		}
		list.push(pattern);
		return this.expressionListToExpression(list);
	}
	protected expressionListToExpression(list: ExpressionNode[]): ExpressionNode {
		if (list.length === 1) { return list[0]; }
		return new CommaNode(list);
	}
	protected parseMemberExpression(): ExpressionNode {
		// MemberExpression ::
		//   (PrimaryExpression | FunctionLiteral | ClassLiteral)
		//     ('[' Expression ']' | '.' Identifier | Arguments | TemplateLiteral)*
		//
		// CallExpression ::
		//   (SuperCall | ImportCall)
		//     ('[' Expression ']' | '.' Identifier | Arguments | TemplateLiteral)*
		//
		// The '[' Expression ']' and '.' Identifier parts are parsed by
		// ParseMemberExpressionContinuation, and everything preceeding it is merged
		// into ParsePrimaryExpression.

		// Parse the initial primary or function expression.
		const result = this.parsePrimaryExpression();
		return this.parseMemberExpressionContinuation(result);
	}
	protected toParamterNode(expression: ExpressionNode): FormalParamterNode {
		if (expression instanceof AssignmentNode) {
			return new FormalParamterNode(expression.getLeft(), expression.getRight());
		}
		if (expression instanceof GroupingNode) {
			return new FormalParamterNode(expression.getNode());
		}
		return new FormalParamterNode(expression);
	}
	protected parsePrimaryExpression(): ExpressionNode {
		// PrimaryExpression ::
		//   'this'
		//   'null'
		//   'true'
		//   'false'
		//   Identifier
		//   Number
		//   String
		//   ArrayLiteral
		//   ObjectLiteral
		//   RegExpLiteral
		//   '(' Expression ')'
		//   do Block
		//   AsyncFunctionLiteral

		let token = this.peek();
		if (Token.isAnyIdentifier(token.token)) {
			this.consume(token.token);
			let kind: ArrowFunctionType = ArrowFunctionType.NORMAL;
			if (token.isType(Token.ASYNC) && !this.scanner.hasLineTerminatorBeforeNext()) {
				// async function ...
				if (this.peek().isType(Token.FUNCTION)) {
					return this.parseFunctionDeclarationAndGenerator();
				};
				// async Identifier => ...
				if (Token.isAnyIdentifier(this.peek().token) && this.peekAhead().isType(Token.ARROW)) {
					token = this.next();
					kind = ArrowFunctionType.ASYNC;
				}
			}
			if (this.peek().isType(Token.ARROW)) {
				const name = this.parseAndClassifyIdentifier(token);
				const params: FormalParamterNode[] = [];
				if (name instanceof CommaNode) {
					params.push(...name.getExpressions().map(this.toParamterNode));
				} else {
					params.push(this.toParamterNode(name));
				}
				return this.parseArrowFunctionLiteral(params, kind);
			}
			return this.parseAndClassifyIdentifier(token);
		}

		if (Token.isLiteral(token.token)) {
			return expressionFromLiteral(this.next());
		}

		switch (token.token) {
			case Token.NEW:
				return this.parseMemberWithPresentNewPrefixesExpression();
			case Token.THIS:
				this.consume(Token.THIS);
				return ThisNode;
			case Token.DIV:
			case Token.DIV_ASSIGN:
				// case Token.REGEXP_LITERAL:
				// this.consume(Token.REGEXP_LITERAL);
				// return token.value!;
				return this.parseRegExpLiteral();
			case Token.FUNCTION:
				this.consume(Token.FUNCTION);
				if (this.peek().isType(Token.MUL)) {
					this.consume(Token.MUL);
					return this.parseFunctionExpression(FunctionType.GENERATOR);
				}
				return this.parseFunctionExpression(FunctionType.NORMAL);
			case Token.SUPER: {
				return this.parseSuperExpression();
			}
			case Token.IMPORT:
				return this.parseImportExpressions();

			case Token.L_BRACKETS:
				return this.parseArrayLiteral();

			case Token.L_CURLY:
				return this.parseObjectLiteral();

			case Token.L_PARENTHESES: {
				this.consume(Token.L_PARENTHESES);
				if (this.check(Token.R_PARENTHESES)) {
					// ()=>x.  The continuation that consumes the => is in
					// ParseAssignmentExpressionCoverGrammar.

					if (!this.peek().isType(Token.ARROW)) {
						throw new Error(this.errorMessage(`Unexpected Token: ${Token.R_PARENTHESES.getName()}`));
					}
					return this.parseArrowFunctionLiteral([], ArrowFunctionType.NORMAL);
				}
				// Heuristically try to detect immediately called functions before
				// seeing the call parentheses.

				const peekToken = this.peek();
				let expression: ExpressionNode;
				const info: FunctionInfo = {};
				if (peekToken.isType(Token.FUNCTION)) {
					this.consume(Token.FUNCTION);
					expression = this.parseFunctionLiteral(FunctionType.NORMAL);
				} else if (peekToken.isType(Token.ASYNC) && this.peekAhead().isType(Token.FUNCTION)) {
					this.consume(Token.ASYNC);
					this.consume(Token.FUNCTION);
					expression = this.parseFunctionLiteral(FunctionType.ASYNC);
				} else {
					expression = this.parseExpressionCoverGrammar(info);
				}
				this.expect(Token.R_PARENTHESES);
				if (this.peek().isType(Token.ARROW)) {
					expression = this.parseArrowFunctionLiteral([expression], ArrowFunctionType.NORMAL, info.rest);
				}
				return expression;
			}
			case Token.CLASS: {
				throw new Error(this.errorMessage(`not supported`));
			}
			case Token.TEMPLATE_LITERALS:
				return this.parseTemplateLiteral();
			default:
				break;
		}
		throw new Error(this.errorMessage(`Unexpected Token: ${JSON.stringify(this.next())}`));
	}
	protected parseTemplateLiteral(tag?: ExpressionNode): ExpressionNode {
		const template = this.next().getValue() as PreTemplateLiteral;
		const exprs = template.expressions.map(expr => JavaScriptParser.parse(expr));

		if (tag) {
			return new TemplateLiteralsNode(tag, template.strings, exprs);
		} else {
			return new TemplateLiteralsNode(JavaScriptParser.parse('String.raw'), template.strings, exprs);
		}
	}
	protected parseMemberWithPresentNewPrefixesExpression(): ExpressionNode {
		this.consume(Token.NEW);
		let classRef: ExpressionNode;
		if (this.peek().isType(Token.IMPORT) && this.peekAhead().isType(Token.L_PARENTHESES)) {
			throw new Error(this.errorMessage(`parsing new import (`));
		} else if (this.peek().isType(Token.SUPER)) {
			throw new Error(this.errorMessage(`parsing new super() is never allowed`));
		} else if (this.peek().isType(Token.PERIOD)) {
			classRef = this.parseNewTargetExpression();
			return this.parseMemberExpressionContinuation(classRef);
		} else {
			classRef = this.parseMemberExpression();
		}
		if (this.peek().isType(Token.L_PARENTHESES)) {
			// NewExpression with arguments.
			const args: ExpressionNode[] = this.parseArguments();
			classRef = new NewNode(classRef, args);
			// The expression can still continue with . or [ after the arguments.
			return this.parseMemberExpressionContinuation(classRef);
		}
		if (this.peek().isType(Token.QUESTION_PERIOD)) {
			throw new Error(this.errorMessage(`parsing new xxx?.yyy at position`));
		}
		return new NewNode(classRef);
	}
	protected parseArguments(maybeArrow?: ParsingArrowHeadFlag): ExpressionNode[] {
		// Arguments ::
		//   '(' (AssignmentExpression)*[','] ')'

		this.consume(Token.L_PARENTHESES);
		const args: ExpressionNode[] = [];
		while (this.peek().isNotType(Token.R_PARENTHESES)) {
			const isSpread = this.check(Token.ELLIPSIS);
			let argument: ExpressionNode = this.parseAssignmentExpressionCoverGrammar();
			if (ParsingArrowHeadFlag.MaybeArrowHead === maybeArrow) {
				if (isSpread) {
					if (argument instanceof AssignmentNode) {
						throw new Error(this.errorMessage(` Rest parameter may not have a default initializer'`));
					}
					if (this.peek().isType(Token.COMMA)) {
						throw new Error(this.errorMessage(`parsing '...spread,arg =>'`));
					}
				}
			}
			if (isSpread) {
				argument = new SpreadNode(argument);
			}
			args.push(argument);
			if (!this.check(Token.COMMA)) break;
		}
		if (!this.check(Token.R_PARENTHESES)) {
			throw new Error(this.errorMessage(`parsing arguments call, expecting ')'`));
		}
		return args;
	}
	protected parseAssignmentExpressionCoverGrammar(): ExpressionNode {
		// AssignmentExpression ::
		//   ConditionalExpression
		//   ArrowFunction
		//   YieldExpression
		//   LeftHandSideExpression AssignmentOperator AssignmentExpression

		if (this.peek().isType(Token.YIELD) /*&& this.isGenerator()*/) {
			return this.parseYieldExpression();
		}
		let expression: ExpressionNode = this.parseConditionalExpression();
		const op = this.peek().token;
		if (!Token.isArrowOrAssignmentOp(op)) return expression;
		// Arrow functions.
		if (op === Token.ARROW) {
			if (!this.isIdentifier(expression) && !this.isParenthesized(expression)) {
				throw new Error(this.errorMessage(`Malformed Arrow Fun Param List`));
			}
			if (expression instanceof CommaNode) {
				const params = expression.getExpressions().map(expr => new FormalParamterNode(expr));
				return this.parseArrowFunctionLiteral(params, ArrowFunctionType.NORMAL);
			}
			if (expression instanceof GroupingNode) {
				return this.parseArrowFunctionLiteral([new FormalParamterNode(expression.getNode())], ArrowFunctionType.NORMAL);
			}
			return this.parseArrowFunctionLiteral([new FormalParamterNode(expression)], ArrowFunctionType.NORMAL);
		}
		if (this.isAssignableIdentifier(expression)) {
			if (this.isParenthesized(expression)) {
				throw new Error(this.errorMessage(`Invalid Destructuring Target`));
			}
		} else if (this.isProperty(expression)) {
			// throw new Error(this.errorMessage(`Invalid Property Binding Pattern`));
		} else if (this.isPattern(expression) && Token.isAssignment(op)) {
			// Destructuring assignment.
			if (this.isParenthesized(expression)) {
				// Scanner:: Location loc(lhs_beg_pos, end_position());
				// if (expression_scope() -> IsCertainlyDeclaration()) {
				// 	impl() -> ReportMessageAt(loc,
				// 		MessageTemplate:: kInvalidDestructuringTarget);
				// } else {
				// 	// Syntax Error if LHS is neither object literal nor an array literal
				// 	// (Parenthesized literals are
				// 	// CoverParenthesizedExpressionAndArrowParameterList).
				// 	// #sec-assignment-operators-static-semantics-early-errors
				// 	impl() -> ReportMessageAt(loc, MessageTemplate:: kInvalidLhsInAssignment);
				// }
			}
			// expression_scope() -> ValidateAsPattern(expression, lhs_beg_pos, end_position());
		} else {
			if (!this.isValidReferenceExpression(expression)) {
				throw new Error(this.errorMessage(`Invalid Reference Expression`));
			}
			if (Token.isLogicalAssignmentOp(op)) {
				throw new Error(this.errorMessage(`Invalid Lhs In Assignment`));
			}
		}

		this.consume(op);
		// const opPosition = this.position();
		const right: ExpressionNode = this.parseAssignmentExpression();
		// Anonymous function name inference applies to =, ||=, &&=, and ??=.

		if (!Token.isAssignment(op)) {
			throw new Error(this.errorMessage(`Invalid Destructuring Target`));
		}
		return new AssignmentNode(op.getName(), expression, right);
	}
	protected parseAssignmentExpression(): ExpressionNode {
		return this.parseAssignmentExpressionCoverGrammar();
	}
	protected parseArrowFunctionLiteral(parameters: ExpressionNode[], flag: ArrowFunctionType, rest?: boolean): ExpressionNode {
		this.consume(Token.ARROW);
		const body = this.parseFunctionBody();
		return new ArrowFunctionNode(parameters, body, flag, rest);
	}
	protected parseNewTargetExpression(): ExpressionNode {
		throw new Error(this.errorMessage('Expression (new.target) not supported.'));
	}
	protected parseRegExpLiteral(): ExpressionNode {
		if (!this.scanner.scanRegExpPattern()) {
			throw new Error('Unterminated RegExp');
		}
		return this.scanner.currentToken().getValue();
	}
	protected parseSuperExpression(): ExpressionNode {
		throw new Error(this.errorMessage('Expression (supper) not supported.'));
	}
	protected parseImportExpressions(): ExpressionNode {
		throw new Error(this.errorMessage('Expression (import) not supported.'));
	}
	protected parseArrayLiteral(): ExpressionNode {
		// ArrayLiteral ::
		//   '[' Expression? (',' Expression?)* ']'

		this.consume(Token.L_BRACKETS);
		const values: ExpressionNode[] = [];
		let firstSpreadIndex = -1;

		while (!this.check(Token.R_BRACKETS)) {
			let elem: ExpressionNode;
			if (this.peek().isType(Token.COMMA)) {
				this.consume(Token.COMMA);
				continue;
			} else if (this.check(Token.ELLIPSIS)) {
				const argument: ExpressionNode = this.parsePossibleDestructuringSubPattern();
				elem = new SpreadNode(argument);

				if (firstSpreadIndex < 0) {
					firstSpreadIndex = values.length;
				}
				if (this.peek().isType(Token.COMMA)) {
					throw new Error(this.errorMessage(`Element After Rest @${this.position()}`));
				}
			} else {
				elem = this.parsePossibleDestructuringSubPattern();
			}
			values.push(elem);
		}

		return new ArrayLiteralNode(values);
	}
	protected parsePossibleDestructuringSubPattern(): ExpressionNode {
		return this.parseAssignmentExpressionCoverGrammar();
	}
	protected parseObjectLiteral(): ExpressionNode {
		// ObjectLiteral ::
		// '{' (PropertyDefinition (',' PropertyDefinition)* ','? )? '}'

		this.consume(Token.L_CURLY);
		const properties: ExpressionNode[] = [];
		while (!this.check(Token.R_CURLY)) {
			const property: ExpressionNode = this.parseObjectPropertyDefinition();
			properties.push(property);
			if (this.peek().isNotType(Token.R_CURLY)) {
				this.expect(Token.COMMA);
			}
		}
		return new ObjectLiteralNode(properties);
	}
	protected parseObjectPropertyDefinition(): ExpressionNode {
		const propInfo = { kind: PropertyKind.NotSet } as Required<PropertyKindInfo>;
		const nameExpression = this.parseProperty(propInfo);

		switch (propInfo.kind) {
			case PropertyKind.Spread:
				const spared: SpreadNode = nameExpression as SpreadNode;
				return new ObjectLiteralPropertyNode(spared.getNode(), spared);

			case PropertyKind.Value: {
				this.consume(Token.COLON);
				const value = this.parsePossibleDestructuringSubPattern();
				return new ObjectLiteralPropertyNode(nameExpression, value);
			}

			case PropertyKind.Assign:
			case PropertyKind.ShorthandOrClassField:
			case PropertyKind.Shorthand: {
				// PropertyDefinition
				//    IdentifierReference
				//    CoverInitializedName
				//
				// CoverInitializedName
				//    IdentifierReference Initializer?

				const lhs = new IdentifierNode(nameExpression.toString());
				if (!this.isAssignableIdentifier(lhs)) {
					throw new Error(this.errorMessage('Strict Eval Arguments'));
				}
				let value: ExpressionNode;
				if (this.peek().isType(Token.ASSIGN)) {
					this.consume(Token.ASSIGN);
					const rhs = this.parseAssignmentExpression();
					value = new AssignmentNode(Token.ASSIGN.getName(), lhs, rhs);
				} else {
					value = lhs;
				}
				return new ObjectLiteralPropertyNode(nameExpression, value);
			}

			case PropertyKind.Method: {
				// MethodDefinition
				//    PropertyName '(' StrictFormalParameters ')' '{' FunctionBody '}'
				//    '*' PropertyName '(' StrictFormalParameters ')' '{' FunctionBody '}'

				const value = this.parseFunctionLiteral(propInfo.funcFlag);
				return new ObjectLiteralPropertyNode(nameExpression, value);
			}

			case PropertyKind.AccessorGetter:
			case PropertyKind.AccessorSetter: {
				const isGet = propInfo.kind == PropertyKind.AccessorGetter;
				const value = this.parseFunctionLiteral(propInfo.funcFlag);
				return new (isGet ? GetPropertyNode : SetPropertyNode)(nameExpression, value);
			}

			case PropertyKind.ClassField:
			case PropertyKind.NotSet:
				return NullNode;
		}
	}
	protected parseProperty(propInfo: PropertyKindInfo): ExpressionNode {
		let nextToken = this.peek();
		if (this.check(Token.ASYNC)) {
			// async
			nextToken = this.peek();
			if (nextToken.isNotType(Token.MUL)
				&& parsePropertyKindFromToken(nextToken.token, propInfo)
				|| this.scanner.hasLineTerminatorBeforeNext()) {
				return AsyncIdentifier;
			}
			propInfo.kind = PropertyKind.Method;
			propInfo.funcFlag = FunctionType.ASYNC;
		}

		if (this.check(Token.MUL)) {
			// async*
			propInfo.kind = PropertyKind.Method;
			propInfo.funcFlag = FunctionType.ASYNC_GENERATOR;
		}

		nextToken = this.peek();
		if (propInfo.kind == PropertyKind.NotSet && nextToken.isType(Token.GET) || nextToken.isType(Token.SET)) {
			const token = this.next();
			if (parsePropertyKindFromToken(this.peek().token, propInfo)) {
				return nextToken.isType(Token.GET) ? GetIdentifier : SetIdentifier;
			}
			if (token.isType(Token.GET)) {
				propInfo.kind = PropertyKind.AccessorGetter;
			} else if (token.isType(Token.SET)) {
				propInfo.kind = PropertyKind.AccessorSetter;
			}
		}
		let propertyName: ExpressionNode;
		switch (nextToken.token) {
			case Token.IDENTIFIER:
			//   identifier -> "identifier"
			// this.consume(nextToken.token);
			// propertyName = nextToken.getValue();
			// break;
			case Token.STRING:
			case Token.NUMBER:
			case Token.BIGINT:
				//   "12" -> 12
				//   12.3 -> "12.3"
				//   12.30 -> "12.3"
				this.consume(nextToken.token);
				propertyName = new StringNode((nextToken.getValue().toString()));
				break;
			case Token.L_BRACKETS:
				// [Symbol.iterator]
				this.consume(Token.L_BRACKETS);
				propertyName = this.parseAssignmentExpression();
				this.expect(Token.R_BRACKETS);
				if (propInfo.kind === PropertyKind.NotSet) {
					parsePropertyKindFromToken(this.peek().token, propInfo);
				}
				return propertyName;
			case Token.ELLIPSIS:
				if (propInfo.kind == PropertyKind.NotSet) {
					this.consume(Token.ELLIPSIS);
					propertyName = this.parsePossibleDestructuringSubPattern();
					propInfo.kind = PropertyKind.Spread;

					if (!this.isValidReferenceExpression(propertyName)) {
						throw new Error(this.errorMessage('Invalid Rest Binding/Assignment Pattern'));
					}
					if (this.peek().isNotType(Token.R_CURLY)) {
						throw new Error(this.errorMessage('Element After Rest'));
					}
					return propertyName;
				}
			default:
				propertyName = new StringNode(this.parsePropertyName().toString());
				break;
		}
		if (propInfo.kind === PropertyKind.NotSet) {
			parsePropertyKindFromToken(this.peek().token, propInfo);
		}
		return propertyName;
	}
	protected parseMemberExpressionContinuation(expression: ExpressionNode): ExpressionNode {
		if (!Token.isMember(this.peek().token)) return expression;
		return this.doParseMemberExpressionContinuation(expression);
	}
	protected doParseMemberExpressionContinuation(expression: ExpressionNode): ExpressionNode {
		if (!Token.isMember(this.peek().token)) {
			throw new Error(this.errorMessage(`Parsing member expression`));
		}
		// Parses this part of MemberExpression:
		// ('[' Expression ']' | '.' Identifier | TemplateLiteral)*
		do {
			switch (this.peek().token) {
				case Token.L_BRACKETS: {
					this.consume(Token.L_BRACKETS);
					const index = this.parseExpressionCoverGrammar();
					expression = new ComputedMemberAccessNode(expression, index);
					this.expect(Token.R_BRACKETS);
					break;
				}
				case Token.PERIOD: {
					this.consume(Token.PERIOD);
					const key: ExpressionNode = this.parsePropertyName();
					expression = new MemberAccessNode(expression, key);
					break;
				}
				case Token.TEMPLATE_LITERALS: {
					expression = this.parseTemplateLiteral(expression);
					break;
				}
				default:
					break;
			}
		} while (Token.isMember(this.peek().token));
		return expression;
	}
	protected parsePropertyName(): ExpressionNode {
		const next = this.next();
		if (next.getValue() instanceof IdentifierNode) {
			return next.getValue();
		}
		// check keyword as identifier
		if (Token.isPropertyName(next.token)) {
			return new IdentifierNode(next.token.getName());
		}
		throw new Error(this.errorMessage(`Parsing property expression: Unexpected Token`));
	}
	protected parsePipelineExpression(expression: ExpressionNode): ExpressionNode {
		// ConditionalExpression ::
		//   LogicalExpression
		//   expression '|>' function [':' expression [':'? expression] ] *
		//   expression '|>' function '('[expression ','?]* ')'
		//
		//   expression '|>' function ':' expression [':' expression | '?']*]
		//   expression '|>' function '(' expression [',' expression | '?']* ')'
		//
		// [~Await]PipelineExpression[?In, ?Yield, ?Await] |> LogicalORExpression[?In, ?Yield, ?Await]
		// [+Await]PipelineExpression[? In, ? Yield, ? Await] |> [lookahead ∉ { await }]LogicalORExpression[? In, ? Yield, ? Await]


		while (this.peek().isType(Token.PIPELINE)) {
			this.consume(Token.PIPELINE);
			const func = this.parseMemberExpression(); //this.parseLogicalExpression();
			let args: (ExpressionNode | '?' | '...?')[] = [];
			switch (this.peek().token) {
				case Token.COLON:
					// support angular pipeline syntax
					do {
						this.consume(Token.COLON);
						const isSpread = this.check(Token.ELLIPSIS);
						if (this.peek().isType(Token.CONDITIONAL)) {
							this.consume(Token.CONDITIONAL);
							if (isSpread) {
								args.push('...?');
							} else {
								args.push('?');
							}
						} else {
							const arg = this.parseLogicalExpression();
							if (isSpread) {
								args.push(new SpreadNode(arg));
							} else {
								args.push(arg);
							}
						}
					} while (this.peek().isType(Token.COLON));
					break;
				case Token.L_PARENTHESES:
					// es2020 syntax
					this.consume(Token.L_PARENTHESES);
					while (this.peek().isNotType(Token.R_PARENTHESES)) {
						if (this.peek().isType(Token.CONDITIONAL)) {
							this.consume(Token.CONDITIONAL);
							args.push('?');
						} else {
							args.push(this.parseLogicalExpression());
						}
					}
					this.expect(Token.R_PARENTHESES);
					break;
				default:
					break;
			}
			expression = new PipelineNode(expression, func, args);
		}
		return expression;
	}
	protected parseConditionalExpression(): ExpressionNode {
		// ConditionalExpression ::
		//   LogicalExpression
		//   LogicalExpression '?' AssignmentExpression ':' AssignmentExpression
		//

		let expression: ExpressionNode = this.parseLogicalExpression();
		expression = this.parsePipelineExpression(expression);
		return this.peek().isType(Token.CONDITIONAL) ? this.parseConditionalContinuation(expression) : expression;
	}
	protected parseLogicalExpression(): ExpressionNode {
		// throw new Error(this.errorMessage('Method not implemented.'));
		// LogicalExpression ::
		//   LogicalORExpression
		//   CoalesceExpression

		// Both LogicalORExpression and CoalesceExpression start with BitwiseOR.
		// Parse for binary expressions >= 6 (BitwiseOR);

		let expression: ExpressionNode = this.parseBinaryExpression(6);
		const peek = this.peek();
		if (peek.isType(Token.AND) || peek.isType(Token.OR)) {
			// LogicalORExpression, pickup parsing where we left off.
			const precedence = peek.token.getPrecedence();
			expression = this.parseBinaryContinuation(expression, 4, precedence);
		} else if (peek.isType(Token.NULLISH)) {
			expression = this.parseNullishExpression(expression);
		}
		return expression;
	}
	protected parseBinaryContinuation(x: ExpressionNode, prec: number, prec1: number): ExpressionNode {
		do {
			// prec1 >= 4
			while (this.peek().token.getPrecedence() === prec1) {
				let y: ExpressionNode;
				let op = this.next();

				const is_right_associative = op.isType(Token.EXP);
				const next_prec = is_right_associative ? prec1 : prec1 + 1;
				y = this.parseBinaryExpression(next_prec);


				// For now we distinguish between comparisons and other binary
				// operations.  (We could combine the two and get rid of this
				// code and AST node eventually.)

				if (Token.isCompare(op.token)) {
					// We have a comparison.
					let cmp = op.token;
					switch (op.token) {
						case Token.NE: cmp = Token.EQ; break;
						case Token.NE_STRICT: cmp = Token.EQ_STRICT; break;
						default: break;
					}
					x = shortcutNumericLiteralBinaryExpression(x, y, cmp);
					if (op.isNotType(cmp)) {
						// The comparison was negated - add a NOT.
						x = buildUnaryExpression(x, Token.NOT);
					}
				} else {
					x = shortcutNumericLiteralBinaryExpression(x, y, op.token);
				}
			}
			--prec1;
		} while (prec1 >= prec);

		return x;
	}
	protected parseBinaryExpression(precedence: number): ExpressionNode {
		const x: ExpressionNode = this.parseUnaryExpression();
		const precedence1 = this.peek().token.getPrecedence();
		if (precedence1 >= precedence) {
			return this.parseBinaryContinuation(x, precedence, precedence1);
		}
		return x;
	}
	protected parseUnaryExpression(): ExpressionNode {
		// UnaryExpression ::
		//   PostfixExpression
		//   'delete' UnaryExpression
		//   'void' UnaryExpression
		//   'typeof' UnaryExpression
		//   '++' UnaryExpression
		//   '--' UnaryExpression
		//   '+' UnaryExpression
		//   '-' UnaryExpression
		//   '~' UnaryExpression
		//   '!' UnaryExpression
		//   [+Await] AwaitExpression[?Yield]

		const op = this.peek();
		if (Token.isUnaryOrCount(op.token)) {
			return this.parseUnaryOrPrefixExpression();
		}
		if (op.isType(Token.AWAIT)) {
			return this.parseAwaitExpression();
		}
		return this.parsePostfixExpression();
	}
	protected parseUnaryOrPrefixExpression(): ExpressionNode {
		const op = this.next();
		const expression = this.parseUnaryExpression();
		if (Token.isUnary(op.token)) {
			if (op.isType(Token.DELETE)) {
				if (this.isIdentifier(expression)) {
					// "delete identifier" is a syntax error in strict mode.
					throw new Error(this.errorMessage(`"delete identifier" is a syntax error in strict mode`));
				}
				if (expression instanceof AccessNode && expression.getRight().toString().startsWith('#')) {
					throw new Error(this.errorMessage(`"Delete Private Field" is a syntax error`));
				}
			}

			if (this.peek().isType(Token.EXP)) {
				throw new Error(this.errorMessage(`Unexpected Token Unary Exponentiation`));
			}
		}

		if (Token.isCount(op.token) || Token.isUnary(op.token)) {
			// Allow the parser to rewrite the expression.
			return buildUnaryExpression(expression, op.token);
		}
		throw new Error(this.errorMessage(`while rewrite unary operation`));
	}
	protected parsePostfixExpression(): ExpressionNode {
		// PostfixExpression ::
		//   LeftHandSideExpression ('++' | '--')?

		const expression: ExpressionNode = this.parseLeftHandSideExpression();
		if (!Token.isCount(this.peek().token) || this.scanner.hasLineTerminatorBeforeNext()) {
			return expression;
		}
		return this.parsePostfixContinuation(expression);
	}
	protected parsePostfixContinuation(expression: ExpressionNode): ExpressionNode {
		if (!this.isValidReferenceExpression(expression)) {
			throw new Error(this.errorMessage(`Invalid Lhs In Postfix Op.`));
		}
		const op = this.next();
		return buildPostfixExpression(expression, op.token);
	}
	protected parseLeftHandSideExpression(): ExpressionNode {
		// LeftHandSideExpression ::
		//   (NewExpression | MemberExpression) ...
		const result = this.parseMemberExpression();
		if (!Token.isPropertyOrCall(this.peek().token)) return result;
		return this.parseLeftHandSideContinuation(result);
	}
	protected parseLeftHandSideContinuation(result: ExpressionNode): ExpressionNode {
		if (this.peek().isType(Token.L_PARENTHESES)
			&& this.isIdentifier(result)
			&& this.scanner.currentToken().isType(Token.ASYNC)
			&& !this.scanner.hasLineTerminatorBeforeNext()) {
			const args = this.parseArguments(ParsingArrowHeadFlag.AsyncArrowFunction);
			if (this.peek().isType(Token.ARROW)) {
				// async () => ...
				if (!args.length) return new EmptyNode;
				// async ( Arguments ) => ...
				return this.expressionListToExpression(args);
			}
			result = new FunctionCallNode(result, args);
			if (!Token.isPropertyOrCall(this.peek().token)) return result;
		}

		let optionalChaining = false;
		let isOptional = false;
		do {
			switch (this.peek().token) {
				case Token.QUESTION_PERIOD: {
					if (isOptional) {
						throw new Error(this.errorMessage(`Failure Expression`));
					}
					this.consume(Token.QUESTION_PERIOD);
					isOptional = true;
					optionalChaining = true;
					if (Token.isPropertyOrCall(this.peek().token)) continue;
					const key = this.parsePropertyName();
					result = new OptionalChainingNode(result, key, 'property');
					break;
				}

				/* Property */
				case Token.L_BRACKETS: {
					this.consume(Token.L_BRACKETS);
					const index = this.parseExpressionCoverGrammar();
					result = new ComputedMemberAccessNode(result, index);
					this.expect(Token.R_BRACKETS);
					break;
				}

				/* Property */
				case Token.PERIOD: {
					if (isOptional) {
						throw new Error(this.errorMessage(`Unexpected Token:${this.position()}`));
					}
					this.consume(Token.PERIOD);
					const key = this.parsePropertyName();
					result = new MemberAccessNode(result, key);
					break;
				}

				/* Call */
				case Token.L_PARENTHESES: {
					const args = this.parseArguments();
					if (result.toString() === 'eval') {
						throw new Error(this.errorMessage(`'eval(...)' is not supported.`));
					}
					result = new FunctionCallNode(result, args);
					break;
				}

				default:
					// Template literals in/after an Optional Chain not supported:
					if (optionalChaining) {
						throw new Error(this.errorMessage(`Optional Chaining No Template support`));
					}
					/* Tagged Template */
					result = this.parseTemplateLiteral(result);
					break;
			}
			if (isOptional) {
				isOptional = false;
			}
		} while (Token.isPropertyOrCall(this.peek().token));
		return result;
	}
	protected parseAwaitExpression(): ExpressionNode {
		this.consume(Token.AWAIT);
		const value = this.parseUnaryExpression();
		if (this.peek().isType(Token.EXP)) {
			throw new Error(this.scanner.createError(`Unexpected Token Unary Exponentiation`));
		}
		return buildUnaryExpression(value, Token.AWAIT);
	}
	protected parseNullishExpression(expression: ExpressionNode): ExpressionNode {
		// CoalesceExpression ::
		//   CoalesceExpressionHead ?? BitwiseORExpression
		//
		//   CoalesceExpressionHead ::
		//     CoalesceExpression
		//     BitwiseORExpression

		// We create a binary operation for the first nullish, otherwise collapse
		// into an nary expression.

		const list: ExpressionNode[] = [];
		list.push(expression);
		while (this.peek().isType(Token.NULLISH)) {
			this.consume(Token.NULLISH);
			// Parse BitwiseOR or higher.
			expression = this.parseBinaryExpression(6);
			list.push(expression);
		}
		expression = list.pop()!;
		expression = list.reverse()
			.reduce((previous, current) => new LogicalNode(Token.NULLISH.getName(), current, previous), expression);
		return expression;
	}
	protected parseConditionalContinuation(expression: ExpressionNode): ExpressionNode {
		this.consume(Token.CONDITIONAL);
		const left: ExpressionNode = this.parseAssignmentExpression();
		this.expect(Token.COLON);
		const right = this.parseAssignmentExpression();
		return new TernaryNode(expression, left, right);
	}
	protected parseYieldExpression(): ExpressionNode {
		// YieldExpression ::
		//   'yield' ([no line terminator] '*'? AssignmentExpression)?
		this.consume(Token.YIELD);
		let delegating = false;  // yield*
		let expression: ExpressionNode;
		if (this.check(Token.MUL)) {
			delegating = true;
		}
		switch (this.peek().token) {
			case Token.EOS:
			case Token.SEMICOLON:
			case Token.R_CURLY:
			case Token.R_BRACKETS:
			case Token.R_PARENTHESES:
			case Token.COLON:
			case Token.COMMA:
			case Token.IN:
				// The above set of tokens is the complete set of tokens that can appear
				// after an AssignmentExpression, and none of them can start an
				// AssignmentExpression.  This allows us to avoid looking for an RHS for
				// a regular yield, given only one look-ahead token.
				if (!delegating) break;
				// Delegating yields require an RHS; fall through.
				// V8_FALLTHROUGH;
				throw new Error(this.errorMessage(`Delegating yields require an RHS`));
			default:
				expression = this.parseAssignmentExpressionCoverGrammar();
				break;
		}
		// }

		throw new Error(this.errorMessage(`Yield expression is not supported now.`));
		// // Hackily disambiguate o from o.next and o [Symbol.iterator]().
		// // TODO(verwaest): Come up with a better solution.
		// return new YieldNode(expression!);
	}
}
