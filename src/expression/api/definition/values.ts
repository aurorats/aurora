import { AbstractExpressionNode } from '../abstract.js';
import { Deserializer } from '../deserialize/deserialize.js';

@Deserializer()
export class PropertyNode extends AbstractExpressionNode {

    static fromJSON(node: PropertyNode): PropertyNode {
        return new PropertyNode(node.property);
    }

    constructor(private property: string | number) {
        super();
    }

    set(context: object, value: any) {
        Reflect.set(context, this.property, value);
        return value;
    }

    get(context: { [key: string]: any }) {
        return context[this.property];
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

@Deserializer()
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


@Deserializer()
export class NativeValueNode extends AbstractExpressionNode {

    static fromJSON(node: NativeValueNode): NativeValueNode {
        switch (String(node.value)) {
            case TRUE: return TrueNode as NativeValueNode;
            case FALSE: return FalseNode as NativeValueNode;
            case NULL: return NullNode as NativeValueNode;
            case UNDEFINED:
            default: return UndefinedNode as NativeValueNode;
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

export const NullNode = Object.freeze(new NativeValueNode(null));
export const UndefinedNode = Object.freeze(new NativeValueNode(undefined));
export const TrueNode = Object.freeze(new NativeValueNode(true));
export const FalseNode = Object.freeze(new NativeValueNode(false));
export const ThisNode = Object.freeze(new PropertyNode('this'));
