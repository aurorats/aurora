
import { Deserializer } from '../deserialize/deserialize.js';
import { AbstractExpressionNode } from '../abstract.js';
import { ScopedStack } from '../scope.js';

@Deserializer('property')
export class PropertyNode extends AbstractExpressionNode {

    static fromJSON(node: PropertyNode): PropertyNode {
        return new PropertyNode(node.property);
    }

    constructor(private property: string | number) {
        super();
    }

    set(stack: ScopedStack, value: any) {
        return stack.set(this.property, value) ? value : void 0;
    }

    get(stack: ScopedStack) {
        return stack.get(this.property);
    }

    entry(): string[] {
        return [this.toString()];
    }

    event(): string[] {
        return [this.toString()];
    }

    toString(): string {
        return String(this.property);
    }

    toJson(): object {
        return { property: this.property };
    }
}

@Deserializer('value')
export class ValueNode extends AbstractExpressionNode {

    static fromJSON(node: ValueNode): ValueNode {
        return new ValueNode(node.value);
    }

    private quote: string;

    constructor(private value: string | number) {
        super();
        if (typeof value === 'string') {
            this.quote = value.substring(0, 1);
            value = `"${value.substring(1, value.length - 1)}"`;
        }
        this.value = JSON.parse(value as string);
    }

    set() {
        throw new Error("ValueNode#set() has no implementation.");
    }

    get() {
        return this.value;
    }

    entry(): string[] {
        return [];
    }

    event(): string[] {
        return [];
    }

    toString(): string {
        if (typeof this.value === 'string') {
            return `${this.quote}${this.value}${this.quote}`;
        }
        return String(this.value);
    }

    toJson(): object {
        let node: { value: string | number };
        if (typeof this.value === 'string') {
            node = { value: `${this.quote}${this.value}${this.quote}` };
        } else {
            node = { value: this.value };
        }
        return node;
    }
}

export const TRUE = String(true);
export const FALSE = String(false);
export const NULL = String(null);
export const UNDEFINED = String(undefined);

@Deserializer('literal')
export class LiteralNode extends AbstractExpressionNode {

    static fromJSON(node: LiteralNode): LiteralNode {
        switch (String(node.value)) {
            case TRUE: return TrueNode as LiteralNode;
            case FALSE: return FalseNode as LiteralNode;
            case NULL: return NullNode as LiteralNode;
            case UNDEFINED:
            default: return UndefinedNode as LiteralNode;
        }
    }

    constructor(private value: true | false | null | undefined | bigint) {
        super();
        this.value = this.value;
    }

    set() {
        throw new Error("BooleanNode.set() Method has not implementation.");
    }

    get() {
        return this.value;
    }

    entry(): string[] {
        return [];
    }

    event(parent?: string): string[] {
        return []
    }

    toString(): string {
        return String(this.value);
    }

    toJson(): object {
        return { value: this.toString() };
    }

}

export const NullNode = Object.freeze(new LiteralNode(null)) as LiteralNode;
export const UndefinedNode = Object.freeze(new LiteralNode(undefined)) as LiteralNode;
export const TrueNode = Object.freeze(new LiteralNode(true)) as LiteralNode;
export const FalseNode = Object.freeze(new LiteralNode(false)) as LiteralNode;
export const ThisNode = Object.freeze(new PropertyNode('this')) as PropertyNode;
