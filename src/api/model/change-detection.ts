import { isHTMLComponent } from '../component/custom-element.js';

export interface Model {
    __observable: { [key: string]: Function[] };
    subscribeModel(eventName: string, callback: Function): void;
    emitChangeModel(eventName: string, source?: any[]): void;
}

export function isModel(object: any): object is Model {
    return object.__observable
        && object.subscribeModel
        && object.emitChangeModel;
}

export function defineModel(object: any): void {
    if (!isModel(object) && typeof object === 'object') {
        const observable: { [key: string]: Function[] } = {};
        Object.defineProperty(object, '__observable', { value: observable });
        Object.defineProperty(object, 'subscribeModel', {
            value: (eventName: string, callback: Function) => {
                observable[eventName] = observable[eventName] || [];
                observable[eventName].push(callback);
            }
        });
        Object.defineProperty(object, 'emitChangeModel', {
            value: (eventName: string, source?: any[]) => {
                if (!source) {
                    source = [object];
                } else {
                    source.push(object);
                }
                let calls = Object.keys(observable)
                    .filter(key => key.startsWith(eventName) || eventName.startsWith(key));
                calls.forEach(key => {
                    observable[key].forEach(call => call(source));
                });
            }
        });
    }
}

export function subscribe2way(obj1: {}, obj1PropName: string, obj2: {}, obj2PropName: string, callback1?: Function, callback2?: Function) {

    let subject1: any, subject2: any;
    if (isHTMLComponent(obj1)) {
        subject1 = obj1._model;
    } else {
        subject1 = obj1;
    }
    if (isHTMLComponent(obj2)) {
        subject2 = obj2._model;
    } else {
        subject2 = obj2;
    }

    defineModel(subject1);
    defineModel(subject2);

    subject1.subscribeModel(obj1PropName, (source: any[]) => {
        if (callback1) {
            callback1();
        }
        // updateValue(obj1, obj1ChildName, obj2, obj2ChildName);
        if (!source.includes(subject2) && isModel(subject2)) {
            subject2.emitChangeModel(obj2PropName, source);
        }
    });
    subject2.subscribeModel(obj2PropName, (source: any[]) => {
        if (callback2) {
            callback2();
        }
        // updateValue(obj2, obj2ChildName, obj1, obj1ChildName);
        if (!source.includes(subject1) && isModel(subject1)) {
            subject1.emitChangeModel(obj1PropName, source);
        }
    });
}

export function subscribe1way(obj1: {}, obj1PropName: string, obj2: {}, obj2PropName: string, callback?: Function) {

    let subject1: any, subject2: any;
    if (isHTMLComponent(obj1)) {
        subject1 = obj1._model;
    } else {
        subject1 = obj1;
    }
    if (isHTMLComponent(obj2)) {
        subject2 = obj2._model;
    } else {
        subject2 = obj2;
    }

    defineModel(subject1);
    defineModel(subject2);

    subject1.subscribeModel(obj1PropName, (source: any[]) => {
        if (callback) {
            callback();
        }
        // updateValue(obj1, obj1ChildName, obj2, obj2ChildName);
        if (!source.includes(subject2) && isModel(subject2)) {
            subject2.emitChangeModel(obj2PropName, source);
        }
    });
}
