import {
    IncrementDecrementOperators, UnaryOperators,
    ConditionalOperators, LiteralUnaryOperators
} from '../operators/unary.js';
import {
    ArithmeticOperators, ArrayCommaOperators, ArrayOperator,
    AssignmentNode, BitwiseOperators, ComparisonOperators,
    FunctionNode, GroupingOperator, LogicalAssignmentNode,
    LogicalOperators, MemberNode, NavigationNode, ObjectOperator,
    parseInfix, PipelineOperator, RelationalOperators, StatementNode,
    TernaryNode
} from '../operators/infix.js';
import { NodeExpression } from '../expression.js';
import { escapeForRegex, generateTokens } from './parser.js';

//dynamically build js parsing regex:
const tokenParser = new RegExp([
    //numbers
    /\d+(?:\.\d*)?|\.\d+/.source,

    //string-literal
    /["](?:\\[\s\S]|[^"])+["]|['](?:\\[\s\S]|[^'])+[']/.source,

    //booleans
    "true|false",

    //operators
    [
        MemberNode.Operators,
        NavigationNode.Operators,
        GroupingOperator.Operators,
        ObjectOperator.Operators,
        ArrayOperator.Operators,
        TernaryNode.Operators,
        FunctionNode.Operators,
        PipelineOperator.Operators,
        AssignmentNode.Operators,
        LogicalAssignmentNode.Operators,
        ComparisonOperators.Operators,
        ArithmeticOperators.Operators,
        BitwiseOperators.Operators,
        LogicalOperators.Operators,
        ArrayCommaOperators.Operators,
        IncrementDecrementOperators.Operators,
        UnaryOperators.Operators,
        ConditionalOperators.Operators,
        StatementNode.Operators,
    ]
        .flatMap(item => item)
        .filter((value: string, index: number, array: string[]) => {
            return array.indexOf(value) === index;
        })
        .sort((a, b) => b.length - a.length) //so that ">=" is added before "=" and ">"
        .map(escapeForRegex)
        .concat(RelationalOperators.RegexOperator)
        .concat(LiteralUnaryOperators.RegexOperators)
        .join('|'),

    //properties
    //has to be after the operators
    /[a-zA-Z$_ɵ][a-zA-Z0-9$_]*/.source,

    //remaining (non-whitespace-)chars, just in case
    //has to be at the end
    /\S/.source
].map(s => `(${s})`).join('|'), 'g');

function oneTimeProcess(tokens: (NodeExpression | string)[]): (NodeExpression | string)[] {
    MemberNode.parseDotMember(tokens);
    NavigationNode.parseNavigation(tokens);
    ArrayOperator.parseBrackets(tokens);
    return tokens;
}

function tokenAnalysis(tokens: (string | NodeExpression)[]): NodeExpression {

    MemberNode.parseBracketMember(tokens);

    IncrementDecrementOperators.parse(tokens);
    UnaryOperators.parse(tokens);
    ConditionalOperators.parse(tokens);
    LiteralUnaryOperators.parse(tokens);

    TernaryNode.parse(tokens);

    parseInfix(ArithmeticOperators, tokens);
    parseInfix(ComparisonOperators, tokens);
    parseInfix(BitwiseOperators, tokens);
    parseInfix(LogicalAssignmentNode, tokens);
    parseInfix(LogicalOperators, tokens);
    parseInfix(RelationalOperators, tokens);
    parseInfix(PipelineOperator, tokens);
    parseInfix(ArrayCommaOperators, tokens);
    parseInfix(AssignmentNode, tokens);

    return tokens[0] as NodeExpression;
}

export function parseJSExpression(str: string) {
    let tokens: (NodeExpression | string)[] = generateTokens(str, tokenParser);
    oneTimeProcess(tokens);
    GroupingOperator.parse(tokens, tokenAnalysis);
    ObjectOperator.parse(tokens);
    tokenAnalysis(tokens);
    StatementNode.parse(tokens);
    return tokens[0] as NodeExpression;
}
