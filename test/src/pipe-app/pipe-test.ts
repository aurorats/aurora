import { Component } from '@aurorats/core';
import { interval } from 'rxjs';

@Component({
    selector: 'pipe-app',
    template: `
    <div>
        <p>{{observable |> async}}</p>
        <p>{{text}}</p>
        <p>{{text |> lowercase}}</p>
        <p>{{text |> uppercase}}</p>
        <p>{{text |> titlecase}}</p>
        <p>{{obj |> json}}</p>
        <p>{{keyValueObject |> json}}</p> - <p>{{keyValueObject |> keyvalue |> json}}</p>
        <p>{{keyValueArray |> json}}</p> - <p>{{keyValueArray |> keyvalue |> json}}</p>
        <p>{{keyValueMap |> json}}</p> - <p>{{keyValueMap |> keyvalue |> json}}</p>
        <p>{{array |> slice:2:3}}</p>
        <p>{{slice(array, 1, 3)}}</p>
    </div>
    `
})
export class PipeTestApp {

    text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla laoreet.';
    obj = {
        a: [1, 2, 3],
        b: 'property b',
        c: {
            d: [],
            e: 4,
            f: [{ 5: 'g' }]
        }
    };

    keyValueObject = {
        1: 100,
        a: 'A00'
    };
    keyValueArray = [200, 300];
    keyValueMap = new Map<number, number | string>([[1, 400], [2, 500], [3, 'B200']]);

    observable = interval(1000);

    array = ['a', 'b', 'c', 'd'];

}
