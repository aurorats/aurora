import { Component, HostListener } from '@ibyar/core';
import { interval } from 'rxjs';

@Component({
    selector: 'bind-2way',
    extend: 'div',
    template: `
    <div class="row">
        <input class="col-sm-12" type="text" [(value)]="data1" />
        <div class="col-sm-12">{{data1 + ' ' + timer |> async}}</div>
    </div>
    <div class="row">
        <input class="col-sm-12" type="text" [(value)]="data2" />
        <div class="col-sm-12">{{data2 |> lowercase + ' ' + timer |> async}}</div>
    </div>
    <hr />
    `
})
export class Binding2Way {

    data1 = 'two way data binding';
    data2 = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla laoreet';

    timer = interval(1000);

    @HostListener('data1')
    onDataOneChange() {
        console.log(`onDataOneChange ==> ${this.data1}`);
    }

    @HostListener('data2')
    onDataTwoChange() {
        console.log(`onDataTwoChange  ==> ${this.data2}`);
    }

}